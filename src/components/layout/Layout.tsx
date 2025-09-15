import { Link, NavLink, Outlet } from 'react-router-dom'

import { cn } from '@/utils/cn'

const navItemBase =
  'px-3 py-2 rounded-md text-sm font-medium transition-colors hover:text-white'
const navItemActive = 'text-white bg-gray-800'
const navItemInactive = 'text-gray-300 hover:bg-gray-700'

export const Layout = () => {
  return (
    <div className="flex min-h-dvh flex-col">
      <nav className="fixed top-0 z-10 w-full border-b border-gray-800/60 bg-gray-900/20 backdrop-blur-[3px]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link className="text-sm font-semibold text-white" to="/">
            three-fiber demos
          </Link>
          <div className="flex items-center gap-2">
            <NavLink
              className={({ isActive }) =>
                cn(navItemBase, isActive ? navItemActive : navItemInactive)
              }
              end
              to="/"
            >
              Smash Particles
            </NavLink>
          </div>
        </div>
      </nav>
      <main className="flex-1 bg-black">
        <Outlet />
      </main>
    </div>
  )
}
