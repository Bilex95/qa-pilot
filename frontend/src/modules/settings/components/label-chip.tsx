/** Label chip from the locked design. Chips stay neutral whatever colour is stored (D-047, BL-010). */
export function LabelChip({ name }: { name: string }) {
  return (
    <span className="label-chip" style={{ maxWidth: "100%" }} title={name}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{name}</span>
    </span>
  );
}
