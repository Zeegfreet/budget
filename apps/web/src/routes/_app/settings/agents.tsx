import { createFileRoute } from '@tanstack/react-router'
import { ConnectedAgentsList, McpConnectionCard } from '@/components/organisms'

export const Route = createFileRoute('/_app/settings/agents')({
  component: AgentsPage,
})

/** AI agents (MCP clients): how to connect one, and the connected ones. */
function AgentsPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Agentes de IA</h1>
      <McpConnectionCard />
      <ConnectedAgentsList />
    </div>
  )
}
