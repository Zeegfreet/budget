import type { LinkProps } from '@tanstack/react-router'
import { LayoutDashboardIcon, type LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  to: NonNullable<LinkProps['to']>
  icon: LucideIcon
}

/** Entries of the app's side menu. Register new top-level pages here. */
export const appNavItems: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboardIcon },
]
