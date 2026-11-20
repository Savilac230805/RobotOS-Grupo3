// src/core/memoryManager.js
// Administrador de bloques de memoria física de RobotOS SmartHouse
// Capacidad total: 1024 MB divididos en 64 bloques de 16 MB cada uno.
// Bloques 0 a 7: Reservados para el Kernel (128 MB, protegidos e inmutables).
// Bloques 8 a 63: Espacio disponible para procesos de usuario y aplicaciones.

export const TOTAL_MEMORY_MB = 1024;
export const BLOCK_SIZE_MB = 16;
export const TOTAL_BLOCKS = 64;
export const KERNEL_BLOCKS_COUNT = 8; // Bloques 0 a 7

export class MemoryManager {
  constructor(initialBlocks = null) {
    this.history = [];
    if (initialBlocks && Array.isArray(initialBlocks) && initialBlocks.length === TOTAL_BLOCKS) {
      this.blocks = initialBlocks.map((b) => ({ ...b }));
    } else {
      this.blocks = Array.from({ length: TOTAL_BLOCKS }, (_, index) => {
        if (index < KERNEL_BLOCKS_COUNT) {
          return {
            id: index,
            state: 'KERNEL',
            processName: 'Kernel_Core',
            color: '#6366F1',
          };
        }
        return {
          id: index,
          state: 'FREE',
          processName: null,
          color: '#1E293B',
        };
      });
    }
  }

  getBlocks() {
    return this.blocks;
  }

  getFreeBlocksCount() {
    return this.blocks.filter((b) => b.state === 'FREE').length;
  }

  getUsedBlocksCount() {
    return this.blocks.filter((b) => b.state === 'ALLOCATED').length;
  }

  getKernelBlocksCount() {
    return KERNEL_BLOCKS_COUNT;
  }

  /**
   * Valida si existe memoria suficiente para la cantidad de bloques solicitados.
   */
  canAllocate(requestedBlocks) {
    const count = Number(requestedBlocks);
    if (!Number.isInteger(count) || count <= 0) return false;
    return count <= this.getFreeBlocksCount();
  }

  /**
   * Asigna bloques contiguos o dispersos a un proceso.
   */
  allocate(processName, blocksCount, color = '#06B6D4', ownerPid = null) {
    const requested = Number(blocksCount);
    if (!Number.isInteger(requested) || requested <= 0) {
      throw new Error(`Cantidad de bloques inválida para asignación: ${blocksCount}`);
    }

    if (!this.canAllocate(requested)) {
      throw new Error(
        `Memoria insuficiente: se solicitaron ${requested} bloques (${requested * BLOCK_SIZE_MB} MB), pero solo hay ${this.getFreeBlocksCount()} bloques disponibles.`
      );
    }

    const cleanName = String(processName).trim();
    let allocatedSoFar = 0;
    const allocatedIndices = [];

    this.blocks = this.blocks.map((b) => {
      if (b.state === 'FREE' && allocatedSoFar < requested) {
        allocatedSoFar += 1;
        allocatedIndices.push(b.id);
        return {
          ...b,
          state: 'ALLOCATED',
          processName: cleanName,
          ownerPid,
          color,
        };
      }
      return b;
    });

    const result = {
      success: true,
      allocatedBlocks: requested,
      allocatedMB: requested * BLOCK_SIZE_MB,
      blockIds: allocatedIndices,
      freeBlocksRemaining: this.getFreeBlocksCount(),
    };
    this.history.push({
      type: 'MEMORY_ALLOCATED',
      pid: Number.isInteger(ownerPid) ? ownerPid : null,
      processName: cleanName,
      blockIds: [...allocatedIndices],
      allocatedBlocks: requested,
      allocatedMB: requested * BLOCK_SIZE_MB,
      timestamp: new Date().toISOString(),
    });
    return result;
  }

  /**
   * Libera todos los bloques asociados a un proceso específico.
   */
  freeProcessMemory(processIdentifier) {
    if (processIdentifier === null || processIdentifier === undefined || processIdentifier === '') return 0;
    const byPid = Number.isInteger(processIdentifier);
    const cleanName = byPid ? null : String(processIdentifier).trim();
    let freedCount = 0;
    const freedBlockIds = [];

    this.blocks = this.blocks.map((b) => {
      if (
        b.state === 'ALLOCATED' &&
        (byPid ? b.ownerPid === processIdentifier : b.processName === cleanName)
      ) {
        freedCount += 1;
        freedBlockIds.push(b.id);
        return {
          ...b,
          state: 'FREE',
          processName: null,
          ownerPid: null,
          color: '#1E293B',
        };
      }
      return b;
    });

    if (freedCount > 0) {
      this.history.push({
        type: 'MEMORY_RELEASED',
        pid: byPid ? processIdentifier : null,
        processName: cleanName,
        blockIds: freedBlockIds,
        freedBlocks: freedCount,
        freedMB: freedCount * BLOCK_SIZE_MB,
        timestamp: new Date().toISOString(),
      });
    }
    return freedCount;
  }

  /**
   * Libera un bloque específico individualmente.
   * Si es bloque de Kernel (0-7), arroja error de protección.
   */
  freeBlock(blockId) {
    const id = Number(blockId);
    if (!Number.isInteger(id) || id < 0 || id >= TOTAL_BLOCKS) {
      throw new Error(`ID de bloque inválido: ${blockId}`);
    }

    const target = this.blocks.find((b) => b.id === id);
    if (!target) {
      throw new Error(`Bloque de memoria #${id} no encontrado.`);
    }

    if (target.state === 'KERNEL' || id < KERNEL_BLOCKS_COUNT) {
      throw new Error(`Operación denegada: El bloque #${id} pertenece al espacio protegido del Kernel.`);
    }

    if (target.state === 'FREE') {
      return { success: true, message: `El bloque #${id} ya se encuentra libre.` };
    }

    this.blocks = this.blocks.map((b) =>
      b.id === id
        ? { ...b, state: 'FREE', processName: null, ownerPid: null, color: '#1E293B' }
        : b
    );

    this.history.push({
      type: 'MEMORY_RELEASED',
      pid: target.ownerPid ?? null,
      processName: target.processName,
      blockIds: [id],
      freedBlocks: 1,
      freedMB: BLOCK_SIZE_MB,
      timestamp: new Date().toISOString(),
    });
    return { success: true, freedBlockId: id, freeBlocksCount: this.getFreeBlocksCount() };
  }

  getHistory() {
    return this.history.map((entry) => ({ ...entry, blockIds: [...entry.blockIds] }));
  }

  /**
   * Calcula la fragmentación externa de la memoria:
   * Porcentaje de memoria libre que se encuentra dividida en segmentos no contiguos.
   * Fórmula: 1 - (segmento_libre_más_grande / total_bloques_libres)
   */
  getFragmentation() {
    const freeCount = this.getFreeBlocksCount();
    if (freeCount === 0) {
      return { fragmentationPercent: 0, maxContiguousFreeBlocks: 0, freeSegmentsCount: 0 };
    }

    let currentContiguous = 0;
    let maxContiguous = 0;
    let segmentsCount = 0;
    let inSegment = false;

    // Solo evaluar espacio no-kernel (bloques 8 a 63)
    for (let i = KERNEL_BLOCKS_COUNT; i < TOTAL_BLOCKS; i++) {
      if (this.blocks[i].state === 'FREE') {
        currentContiguous += 1;
        if (!inSegment) {
          segmentsCount += 1;
          inSegment = true;
        }
        if (currentContiguous > maxContiguous) {
          maxContiguous = currentContiguous;
        }
      } else {
        currentContiguous = 0;
        inSegment = false;
      }
    }

    const fragmentationPercent =
      freeCount > 0 ? Math.round((1 - maxContiguous / freeCount) * 100) : 0;

    return {
      fragmentationPercent: Math.max(0, fragmentationPercent),
      maxContiguousFreeBlocks: maxContiguous,
      maxContiguousFreeMB: maxContiguous * BLOCK_SIZE_MB,
      freeSegmentsCount: segmentsCount,
    };
  }

  getStats() {
    const freeCount = this.getFreeBlocksCount();
    const usedCount = this.getUsedBlocksCount();
    const frag = this.getFragmentation();

    return {
      totalMB: TOTAL_MEMORY_MB,
      blockSizeMB: BLOCK_SIZE_MB,
      totalBlocks: TOTAL_BLOCKS,
      kernelBlocks: KERNEL_BLOCKS_COUNT,
      kernelMB: KERNEL_BLOCKS_COUNT * BLOCK_SIZE_MB,
      usedBlocks: usedCount,
      usedMB: usedCount * BLOCK_SIZE_MB,
      freeBlocks: freeCount,
      freeMB: freeCount * BLOCK_SIZE_MB,
      ...frag,
    };
  }
}

export const memoryManager = new MemoryManager();
