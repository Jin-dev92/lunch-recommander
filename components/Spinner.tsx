import styles from './Spinner.module.css';

export default function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`${styles.spinner} ${className}`.trim()}
      data-testid="spinner"
      aria-hidden="true"
    />
  );
}
