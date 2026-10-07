import { Link, useMatchRoute } from '@tanstack/react-router'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import type { NavItem } from '@/lib/navigation'

/** Main navigation of the side menu. Labels turn into tooltips when it is collapsed. */
export function SidebarNav({ items }: { items: NavItem[] }) {
  const matchRoute = useMatchRoute()
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ label, to, icon: Icon }) => (
            <SidebarMenuItem key={to}>
              <SidebarMenuButton
                asChild
                tooltip={label}
                // "/" would match every page if fuzzy
                isActive={Boolean(matchRoute({ to, fuzzy: to !== '/' }))}
              >
                <Link to={to} onClick={() => isMobile && setOpenMobile(false)}>
                  <Icon aria-hidden />
                  <span>{label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
