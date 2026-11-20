import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PAGE_SIZE_MB,
  MemoryManager,
  PAGE_REPLACEMENT_ALGORITHMS,
  SystemCalls,
  EventEngine,
  TOTAL_MEMORY_MB,
} from '../src/core/index.js';
import { InMemoryPersistenceAdapter } from '../src/core/persistence/InMemoryPersistenceAdapter.js';

const pageAddress = (pageNumber, offset = 0, pageSizeMB = DEFAULT_PAGE_SIZE_MB) =>
  pageNumber * pageSizeMB * 1024 * 1024 + offset;

test('MemoryManager crea espacios de direcciones y tablas de páginas independientes', () => {
  const memory = new MemoryManager();
  memory.createAddressSpace(11, { sizeMB: 2048 });
  memory.createAddressSpace(12, { sizeMB: 1024 });

  assert.equal(memory.getPageTable(11).length, 128);
  assert.equal(memory.getPageTable(12).length, 64);
  assert.equal(memory.getPageTable(11)[0].pid, 11);
  assert.notEqual(memory.getPageTable(11), memory.getPageTable(12));
});

test('MemoryManager configura tamaños de página y conserva direcciones virtuales', () => {
  const memory = new MemoryManager();
  memory.createAddressSpace(1, { sizeMB: 64 });
  memory.configurePageSize(4);

  assert.equal(memory.getVirtualMemoryStats().pageSizeMB, 4);
  assert.equal(memory.getPageTable(1).length, 16);
  assert.throws(() => memory.configurePageSize(3), /Tamaño de página inválido/);
});

test('MemoryManager traduce direcciones, produce page fault y actualiza bits', () => {
  const memory = new MemoryManager();
  memory.configurePageSize(4);
  memory.createAddressSpace(7, { sizeMB: 64 });
  const result = memory.accessVirtualAddress(7, pageAddress(2, 123, 4), { write: true });
  const page = memory.getPageTable(7)[2];

  assert.equal(result.pageFault, true);
  assert.equal(result.pageNumber, 2);
  assert.equal(result.offset, 123);
  assert.equal(result.physicalAddress, result.frame * 4 * 1024 * 1024 + 123);
  assert.equal(page.present, true);
  assert.equal(page.modified, true);
  assert.equal(page.referenced, true);
  assert.equal(memory.getVirtualMemoryStats().pageFaults, 1);
});

test('MemoryManager traduce hits sin duplicar page faults y protege límites virtuales', () => {
  const memory = new MemoryManager();
  memory.createAddressSpace(1, { sizeMB: 32 });
  const first = memory.accessVirtualAddress(1, pageAddress(1));
  const second = memory.accessVirtualAddress(1, pageAddress(1, 8));

  assert.equal(first.pageFault, true);
  assert.equal(second.pageFault, false);
  assert.equal(second.frame, first.frame);
  assert.equal(memory.getVirtualMemoryStats().totalAccesses, 2);
  assert.equal(memory.getVirtualMemoryStats().pageFaults, 1);
  assert.throws(() => memory.accessVirtualAddress(1, pageAddress(2)), /excede el espacio/);
});

test('MemoryManager reemplaza FIFO y LRU de forma reproducible', () => {
  const run = (algorithm) => {
    const memory = new MemoryManager();
    memory.createAddressSpace(5, { sizeMB: 2048 });
    for (let page = 0; page < 56; page += 1) {
      memory.accessVirtualAddress(5, pageAddress(page), { algorithm });
    }
    memory.accessVirtualAddress(5, pageAddress(0), { algorithm });
    return memory.accessVirtualAddress(5, pageAddress(56), { algorithm }).victim.pageNumber;
  };

  assert.equal(run(PAGE_REPLACEMENT_ALGORITHMS.FIFO), 0);
  assert.equal(run(PAGE_REPLACEMENT_ALGORITHMS.LRU), 1);
});

test('MemoryManager compara la misma secuencia sin mutar el estado físico', () => {
  const memory = new MemoryManager();
  const references = [2, 1, 5, 2, 6, 2, 2];
  const result = memory.compareReferenceString(references, 3);

  assert.equal(result.FIFO.totalAccesses, references.length);
  assert.equal(result.LRU.totalAccesses, references.length);
  assert.notEqual(result.FIFO.pageFaults, result.LRU.pageFaults);
  assert.equal(memory.getVirtualMemoryStats().totalAccesses, 0);
});

test('MemoryManager registra PAGE_FAULT y PAGE_RELEASED con el esquema del Event Engine', async () => {
  const memory = new MemoryManager();
  const events = new EventEngine();
  const persistence = new InMemoryPersistenceAdapter();
  const syscalls = new SystemCalls(events, persistence, memory);
  memory.createAddressSpace(19, { sizeMB: 32 });

  const access = syscalls.accessVirtualAddress(19, 0);
  memory.releaseAddressSpace(19);
  await new Promise((resolve) => setImmediate(resolve));
  const history = await persistence.loadHistory();
  const pageFault = history.find((event) => event.type === 'PAGE_FAULT');
  const pageRelease = history.find((event) => event.type === 'PAGE_RELEASED');

  assert.equal(access.pageFault, true);
  assert.match(pageFault.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.ok(Number.isFinite(Date.parse(pageFault.timestamp)));
  assert.equal(pageFault.pid, 19);
  assert.equal(pageFault.payload.pageNumber, 0);
  assert.equal(pageFault.payload.frame, access.frame);
  assert.equal(pageFault.payload.algorithm, PAGE_REPLACEMENT_ALGORITHMS.FIFO);
  assert.equal(pageRelease.payload.pageNumber, 0);
});

test('MemoryManager libera tabla y marcos de un proceso sin fugas', () => {
  const memory = new MemoryManager();
  const initialFreeBlocks = memory.getFreeBlocksCount();
  memory.allocate('page_owner', 1, '#06B6D4', 42);
  memory.createAddressSpace(42, { sizeMB: 64 });
  memory.accessVirtualAddress(42, 0);
  memory.accessVirtualAddress(42, pageAddress(1));

  assert.equal(memory.getVirtualMemoryStats().residentFrames, 2);
  assert.equal(memory.freeProcessMemory(42), 2);
  assert.equal(memory.getFreeBlocksCount(), initialFreeBlocks);
  assert.equal(memory.getVirtualMemoryStats().residentFrames, 0);
  assert.equal(memory.getPhysicalFrames().some((frame) => frame.pid === 42), false);
  assert.throws(() => memory.getPageTable(42), /No existe un espacio virtual/);
});

test('MemoryManager protege todos los marcos físicos reservados al Kernel', () => {
  const memory = new MemoryManager();
  memory.configurePageSize(1);
  memory.createAddressSpace(9, { sizeMB: TOTAL_MEMORY_MB * 2 });
  const result = memory.accessVirtualAddress(9, 0);

  assert.equal(memory.getVirtualMemoryStats().reservedFrames, 128);
  assert.ok(result.frame >= 128);
  assert.ok(memory.getPhysicalFrames().slice(0, 128).every((frame) => frame.state === 'KERNEL'));
});

test('SystemCalls termina procesos y persiste la liberación de sus páginas residentes', async () => {
  const memory = new MemoryManager();
  const persistence = new InMemoryPersistenceAdapter();
  const syscalls = new SystemCalls(new EventEngine(), persistence, memory);
  const initialFreeBlocks = memory.getFreeBlocksCount();
  const { process } = syscalls.createProcess({
    name: 'paged_worker',
    memoryBlocksCount: 1,
  });
  syscalls.accessVirtualAddress(process.pid, 0);
  syscalls.terminateProcess(process.pid, { role: 'USER' }, [process]);
  await new Promise((resolve) => setImmediate(resolve));

  const events = await persistence.loadHistory();
  assert.ok(events.some((event) => event.type === 'PAGE_FAULT' && event.pid === process.pid));
  assert.ok(events.some((event) => event.type === 'PAGE_RELEASED' && event.pid === process.pid));
  assert.equal(memory.getFreeBlocksCount(), initialFreeBlocks);
  assert.equal(memory.getVirtualMemoryStats().residentFrames, 0);
});
