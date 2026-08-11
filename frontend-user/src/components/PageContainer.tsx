export default function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-page py-8 md:py-12">
      <div className="mx-auto max-w-5xl">{children}</div>
    </div>
  );
}
