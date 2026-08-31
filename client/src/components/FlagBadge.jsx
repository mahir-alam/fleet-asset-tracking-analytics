import { FLAG_LABEL, flagTone } from './format.js';

export default function FlagBadge({ kind }) {
  return <span className={`pill ${flagTone(kind)} flag-badge`}>{FLAG_LABEL[kind] ?? kind}</span>;
}
