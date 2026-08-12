import { ArrowUpRight } from 'lucide-react'
import { requestControllerEntryOpen } from '@/components/controllerEntryEvents'
import { CONTROLLER_HELPER_STORE_URL } from '@/engine/controllerHelper'
import { useControllerStore } from '@/store/controllerStore'

function ControllerSilhouette({ extensionPresent }: { extensionPresent: boolean }) {
  return (
    <div className="relative mx-auto hidden h-44 w-36 min-[1040px]:block" aria-hidden>
      <div className="absolute inset-0 rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 shadow-2xl shadow-black/40">
        <div className="absolute inset-3 rounded-lg border border-zinc-800/80" />
        <div className="absolute left-1/2 top-12 grid size-14 -translate-x-1/2 place-items-center rounded-md border border-zinc-700 bg-zinc-950 text-[9px] tracking-[0.14em] text-zinc-600">
          PXLBLZ
        </div>
        <span className={`absolute bottom-7 right-6 size-1.5 rounded-full ${
          extensionPresent ? 'bg-green-400 shadow-[0_0_12px_rgba(74,222,128,0.45)]' : 'bg-zinc-600'
        }`} />
      </div>
      <span className="absolute -right-2 bottom-7 size-11 rounded-full border border-l-0 border-b-0 border-zinc-700/60" />
      <span className="absolute right-0 bottom-9 size-7 rounded-full border border-l-0 border-b-0 border-zinc-700/80" />
      <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] uppercase tracking-[0.12em] text-zinc-700">
        Pixelblaze Controller
      </span>
    </div>
  )
}

export function ControllerProfilesEmptyState() {
  const extensionPresent = useControllerStore((state) => state.extensionPresent)
  const detectExtension = useControllerStore((state) => state.detectExtension)

  return (
    <section
      data-testid="controller-profiles-empty-state"
      aria-labelledby="controller-profiles-empty-title"
      className="flex h-full overflow-y-auto bg-zinc-950/40 px-6 py-10 font-mono sm:px-10"
    >
      <div className="m-auto grid w-full max-w-[760px] grid-cols-1 items-center gap-12 min-[1040px]:grid-cols-[minmax(0,1fr)_9rem]">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
            <span
              className={`size-1.5 rounded-full ${extensionPresent ? 'bg-green-400' : 'bg-red-400'}`}
              aria-hidden
            />
            {extensionPresent ? 'Chrome extension ready' : 'Chrome extension required'}
          </p>
          <h1
            id="controller-profiles-empty-title"
            className="mt-3 text-2xl leading-tight tracking-tight text-zinc-100 sm:text-[30px]"
          >
            {extensionPresent
              ? 'Connect a Controller to create its profile.'
              : 'Connect your Controllers.'}
          </h1>
          <p className="mt-3 max-w-xl text-xs leading-5 text-zinc-400 sm:text-[13px] sm:leading-6">
            {extensionPresent
              ? 'Choose a discovered Controller or enter its IP. PXLBLZ creates the profile automatically.'
              : (
                <>
                  PXLBLZ uses a Chrome extension to reach Controllers on your local network. Install it once,
                  approve Chrome&apos;s install and Controller access prompts, then connect.
                </>
              )}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {extensionPresent ? (
              <button
                type="button"
                onClick={requestControllerEntryOpen}
                className="h-8 rounded-md border border-live/50 bg-live/10 px-3 text-[11px] text-amber-200 transition-colors hover:border-live/75 hover:bg-live/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live/60"
              >
                Connect a Controller
              </button>
            ) : (
              <>
                <a
                  href={CONTROLLER_HELPER_STORE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-2 rounded-md border border-live/50 bg-live/10 px-3 text-[11px] text-amber-200 transition-colors hover:border-live/75 hover:bg-live/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live/60"
                >
                  Install Chrome extension
                  <ArrowUpRight size={13} aria-hidden />
                </a>
                <button
                  type="button"
                  onClick={() => void detectExtension()}
                  className="h-8 rounded-md px-3 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
                >
                  Already installed? Check again
                </button>
              </>
            )}
          </div>
        </div>
        <ControllerSilhouette extensionPresent={extensionPresent} />
      </div>
    </section>
  )
}
