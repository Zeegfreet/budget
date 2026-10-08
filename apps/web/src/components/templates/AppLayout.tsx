import { AppSidebar } from '@/components/organisms'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

/** The side menu remembers whether it was collapsed (cookie set by `SidebarProvider`). */
function sidebarDefaultOpen() {
  return !document.cookie.split('; ').includes('sidebar_state=false')
}

/** Shell for authenticated pages: collapsible side menu + fluid page content. */
export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={sidebarDefaultOpen()}>
        <AppSidebar />
        {/* min-w-0: wide content (e.g. the budget grid) scrolls inside instead of widening the page */}
        <SidebarInset className="min-w-0">
          <div className="w-full min-w-0 flex-1 px-4 py-4 md:px-6 md:py-6 lg:px-8">
            <SidebarTrigger aria-label="Alternar menu lateral" className="-ml-1 mb-4" />
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
