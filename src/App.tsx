import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { GetPi } from '@/components/demos/get-pi'
import { SmashParticles } from '@/components/demos/smash-particles'
import { Layout } from '@/components/layout/Layout'

const App = () => {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route element={<Navigate replace to="/smash-particles" />} index />
          <Route element={<SmashParticles />} path="/smash-particles" />
          <Route element={<GetPi />} path="/get-pi" />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
