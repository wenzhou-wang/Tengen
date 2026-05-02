interface ToastRegionProps {
  message: string;
}

export function ToastRegion({ message }: ToastRegionProps) {
  return (
    <>
      <div className={`toast ${message ? "is-visible" : ""}`} role="status" aria-live="polite">
        {message}
      </div>
      <div className="sr-only" aria-live="polite">
        {message}
      </div>
    </>
  );
}
