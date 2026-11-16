export function Placeholder({ title }: { title: string }) {
  return (
    <>
      <h1 class="screen-title">{title}</h1>
      <section class="panel">
        <p class="small dim">Coming next.</p>
      </section>
    </>
  );
}
