/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROUTER_ADDRESS: string
  readonly VITE_WWWEBD_ADDRESS: string
  readonly VITE_USDC_ADDRESS: string
  readonly VITE_FACTORY_ADDRESS: string
  readonly VITE_CHAIN_ID: string
  readonly VITE_BRIDGE_API: string
  readonly VITE_POLYGON_RPC: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
