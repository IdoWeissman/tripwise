const PALETTE = [
  'bg-member-teal text-member-teal-ink',
  'bg-member-orange text-member-orange-ink',
  'bg-member-blue text-member-blue-ink',
  'bg-member-purple text-member-purple-ink',
  'bg-member-amber text-member-amber-ink',
] as const;

interface AvatarProps {
  name: string;
  /** Join order within the trip — keeps a member's color stable across screens. */
  index: number;
  size?: 'sm' | 'md' | 'lg';
  stacked?: boolean;
  /** Border colour of the stacked ring — match the surface behind the stack. */
  ringClassName?: string;
}

const SIZES = { sm: 'size-6 text-[11px]', md: 'size-8 text-xs', lg: 'size-10 text-[15px]' };

export function Avatar({
  name,
  index,
  size = 'md',
  stacked = false,
  ringClassName = 'border-surface',
}: AvatarProps) {
  return (
    <span
      title={name}
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${SIZES[size]} ${PALETTE[index % PALETTE.length]} ${stacked ? `-mr-2 border-2 ${ringClassName}` : ''}`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
