/**
 * Hand a file to the player: the share sheet on phones (Files, Drive, mail), a download
 * elsewhere. Both work offline.
 */
export async function deliverFile(name: string, text: string): Promise<'shared' | 'downloaded'> {
  const type = 'application/json';
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (touch && typeof File === 'function' && navigator.canShare) {
    const file = new File([text], name, { type });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return 'shared';
      } catch (err) {
        // The player closed the sheet: nothing more to do.
        if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
      }
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
