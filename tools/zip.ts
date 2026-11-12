// Drops entries from a zip archive without unpacking it: the kept entries are
// copied byte for byte (compressed data, CRC and all) and a new central
// directory is written. Enough for the zips tsci writes; no zip64.

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export interface ZipEntry {
  name: string;
  /** The central directory record. */
  central: Uint8Array;
  /** The local header, file name, extra field and data. */
  local: Uint8Array;
}

export const zipEntries = (zip: Uint8Array): ZipEntry[] => {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--)
    if (view.getUint32(i, true) === EOCD) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("not a zip archive");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== CENTRAL)
      throw new Error("broken central directory");
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const compressed = view.getUint32(at + 20, true);
    const offset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(
      zip.subarray(at + 46, at + 46 + nameLength),
    );
    const central = zip.slice(
      at,
      at + 46 + nameLength + extraLength + commentLength,
    );
    if (view.getUint32(offset, true) !== LOCAL)
      throw new Error(`broken local header of ${name}`);
    const localName = view.getUint16(offset + 26, true);
    const localExtra = view.getUint16(offset + 28, true);
    let localEnd = offset + 30 + localName + localExtra + compressed;
    // Sizes after the data (flag bit 3): a descriptor, with or without its signature.
    if (view.getUint16(offset + 6, true) & 8)
      localEnd += view.getUint32(localEnd, true) === 0x08074b50 ? 16 : 12;
    const local = zip.slice(offset, localEnd);
    entries.push({ name, central, local });
    at += central.length;
  }
  return entries;
};

/** The archive with only the entries for which `keep` is true. */
export const filterZip = (
  zip: Uint8Array,
  keep: (name: string) => boolean,
): Uint8Array => {
  const kept = zipEntries(zip).filter((e) => keep(e.name));
  const locals = kept.reduce((s, e) => s + e.local.length, 0);
  const centrals = kept.reduce((s, e) => s + e.central.length, 0);
  const out = new Uint8Array(locals + centrals + 22);
  const view = new DataView(out.buffer);
  let at = 0;
  const offsets: number[] = [];
  for (const e of kept) {
    offsets.push(at);
    out.set(e.local, at);
    at += e.local.length;
  }
  const start = at;
  kept.forEach((e, i) => {
    out.set(e.central, at);
    view.setUint32(at + 42, offsets[i] as number, true);
    at += e.central.length;
  });
  view.setUint32(at, EOCD, true);
  view.setUint16(at + 8, kept.length, true);
  view.setUint16(at + 10, kept.length, true);
  view.setUint32(at + 12, centrals, true);
  view.setUint32(at + 16, start, true);
  return out;
};
