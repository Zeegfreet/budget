import type { LinkProps } from '@tanstack/react-router'
import { CreditCardIcon, LayoutDashboardIcon, ReceiptTextIcon, UsersIcon, type LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  to: NonNullable<LinkProps['to']>
  icon: LucideIcon
}

/** Entries of the app's side menu. Register new top-level pages here. */
export const appNavItems: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboardIcon },
  { label: 'Extrato', to: '/extrato', icon: ReceiptTextIcon },
  { label: 'Grupos', to: '/grupos', icon: UsersIcon },
  { label: 'Meios de pagamento', to: '/meios-de-pagamento', icon: CreditCardIcon },
]
