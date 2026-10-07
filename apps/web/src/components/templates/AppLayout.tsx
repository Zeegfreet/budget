import { AppSidebar } from '@/components/organisms'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

/** The side menu remembers whether it was collapsed (cookie set by `SidebarProvider`). */
function sidebarDefaultOpen() {
  return !document.cookie.split('; ').includes('sidebar_state=false')
}

/** Shell for authenticated pages: collapsible side menu + page content. */
export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={sidebarDefaultOpen()}>
        <AppSidebar />
        <SidebarInset>
          <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-4 md:py-6">
            <SidebarTrigger aria-label="Alternar menu lateral" className="-ml-1 mb-4" />
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
