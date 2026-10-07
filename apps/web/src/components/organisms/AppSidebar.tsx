import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Logo } from '@/components/atoms'
import { SidebarNav, UserMenu } from '@/components/molecules'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { authQueries } from '@/features/auth/queries'
import { appNavItems } from '@/lib/navigation'

/** Collapsible side menu: app navigation on top, the user's account at the bottom. */
export function AppSidebar() {
  // Already loaded by the _app guard
  const { data: user } = useQuery(authQueries.me())

  return (
    <Sidebar collapsible="icon" aria-label="Menu lateral">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link to="/" aria-label="Budget - início">
                <Logo className="pl-1.5" />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Navegação principal">
          <SidebarNav items={appNavItems} />
        </nav>
      </SidebarContent>
      <SidebarFooter>{user && <UserMenu user={user} />}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
