export default function StudiosLoading() {
  return (
    <div
      role="status"
      aria-label="Loading studios"
      className="mx-auto grid max-w-6xl grid-cols-2 gap-3 pb-8 sm:grid-cols-3 sm:gap-5 sm:pt-6 lg:pt-10"
    >
      {Array.from({ length: 9 }, (_, index) => (
        <div
          key={index}
          className="bg-muted/40 aspect-[4/3] rounded-md motion-safe:animate-pulse sm:aspect-[16/9]"
        />
      ))}
    </div>
  );
}
