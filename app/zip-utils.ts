function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createStoredZip(files: Record<string, string>, rootName: string) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const u16 = (value: number) => new Uint8Array([value & 255, (value >>> 8) & 255]);
  const u32 = (value: number) => new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
  const join = (parts: Uint8Array[]) => {
    const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let cursor = 0;
    for (const part of parts) {
      result.set(part, cursor);
      cursor += part.length;
    }
    return result;
  };

  Object.entries(files).forEach(([name, value]) => {
    const nameBytes = encoder.encode(`${rootName}/${name}`);
    const data = encoder.encode(value);
    const checksum = crc32(data);
    const local = join([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(checksum),
      u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes, data,
    ]);
    const central = join([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(checksum),
      u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0),
      u16(0), u32(0), u32(offset), nameBytes,
    ]);
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  });

  const centralDirectory = join(centralParts);
  const end = join([
    u32(0x06054b50), u16(0), u16(0), u16(centralParts.length), u16(centralParts.length),
    u32(centralDirectory.length), u32(offset), u16(0),
  ]);
  return join([...localParts, centralDirectory, end]);
}
