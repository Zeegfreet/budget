import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getInitials } from '@/lib/initials'

type UserAvatarProps = React.ComponentProps<typeof Avatar> & { name: string }

/** The user's initials in a circle. Decorative: the name is always shown or labelled next to it. */
export function UserAvatar({ name, ...props }: UserAvatarProps) {
  return (
    <Avatar aria-hidden {...props}>
      <AvatarFallback>{getInitials(name)}</AvatarFallback>
    </Avatar>
  )
}
