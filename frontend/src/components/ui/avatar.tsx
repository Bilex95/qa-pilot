import { avatarColour, initials } from "@/lib/utils";

/** Initials on a colour derived from the user id, as in the locked design. Decorative: the name is always next to it. */
export function Avatar({ id, name, size = 30 }: { id: string; name: string; size?: number }) {
  return (
    <span className="avatar" aria-hidden="true" style={{ background: avatarColour(id), width: size, height: size }}>
      {initials(name)}
    </span>
  );
}
