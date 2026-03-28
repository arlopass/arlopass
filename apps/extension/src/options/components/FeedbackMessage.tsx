export type FeedbackData = {
  kind: "success" | "error" | "info";
  title: string;
  message: string;
};

export type FeedbackMessageProps = {
  feedback: FeedbackData | null;
};

const kindClasses: Record<FeedbackData["kind"], string> = {
  success:
    "bg-[var(--color-success-subtle)] text-[var(--color-success)] border-[var(--color-success)]/20",
  error:
    "bg-[var(--color-danger-subtle)] text-[var(--color-danger)] border-[var(--color-danger)]/20",
  info: "bg-[var(--ap-brand-subtle)] text-[var(--color-brand)] border-[var(--color-brand)]/20",
};

export function FeedbackMessage({ feedback }: FeedbackMessageProps) {
  if (feedback === null) return null;
  return (
    <div
      className={`mt-3 p-3 rounded-md border animate-fade-in ${kindClasses[feedback.kind]}`}
    >
      <p className="text-[11px] font-bold m-0">{feedback.title}</p>
      <p className="text-[11px] mt-1 m-0 leading-snug">{feedback.message}</p>
    </div>
  );
}
