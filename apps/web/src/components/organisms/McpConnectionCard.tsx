import { useQuery } from '@tanstack/react-query'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { agentQueries } from '@/features/agents/queries'

/** How to connect an AI agent: the MCP server URL and where to paste it. */
export function McpConnectionCard() {
  const { data } = useQuery(agentQueries.info())
  const [copied, setCopied] = useState(false)
  const url = data?.mcpUrl ?? ''

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // Without clipboard access the URL stays selectable in the field
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Conectar um agente</h2>
        </CardTitle>
        <CardDescription>
          Qualquer agente ou assistente de IA compatível com MCP (Model Context Protocol) pode consultar e
          organizar seu orçamento, suas categorias e seus lançamentos. Você aprova cada agente e escolhe se
          ele só lê ou também altera seus dados.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="flex flex-col gap-2">
          <label htmlFor="mcp-url" className="font-medium">
            URL do servidor MCP
          </label>
          <div className="flex gap-2">
            <Input id="mcp-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <Button
              type="button"
              variant="outline"
              disabled={!url}
              onClick={copy}
              aria-label={copied ? 'URL copiada' : 'Copiar URL'}
            >
              {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
            </Button>
          </div>
        </div>
        <section aria-labelledby="mcp-steps" className="flex flex-col gap-2">
          <h3 id="mcp-steps" className="font-medium">
            Como conectar
          </h3>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
            <li>Copie a URL acima.</li>
            <li>
              No seu agente, adicione um servidor MCP remoto (HTTP), também chamado de conector ou
              integração, com essa URL.
            </li>
            <li>O agente abre esta aplicação para você entrar e autorizar o acesso.</li>
          </ol>
          <p className="text-muted-foreground">
            O agente precisa aceitar servidores MCP remotos com autorização OAuth, como fazem Claude,
            ChatGPT, Cursor e VS Code.
          </p>
        </section>
        <details className="group rounded-lg border p-3">
          <summary className="cursor-pointer font-medium">Exemplos de configuração</summary>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Claude:</span> Configurações → Conectores →
              adicionar conector personalizado.
            </li>
            <li>
              <span className="font-medium text-foreground">Cursor:</span> em{' '}
              <code className="rounded bg-muted px-1 py-0.5">mcp.json</code>, um servidor com{' '}
              <code className="rounded bg-muted px-1 py-0.5 [overflow-wrap:anywhere]">"url": "{url}"</code>.
            </li>
            <li>
              <span className="font-medium text-foreground">VS Code:</span> comando{' '}
              <code className="rounded bg-muted px-1 py-0.5">MCP: Add Server</code> → HTTP.
            </li>
            <li>
              <span className="font-medium text-foreground">Claude Code:</span>{' '}
              <code className="rounded bg-muted px-1 py-0.5 [overflow-wrap:anywhere]">
                claude mcp add --transport http budget {url}
              </code>
            </li>
          </ul>
          <p className="mt-3 text-muted-foreground">
            Em outros agentes, procure a opção de adicionar um servidor MCP pela URL.
          </p>
        </details>
      </CardContent>
    </Card>
  )
}
