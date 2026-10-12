import { BOXES_PER_RUN, ingredientFor } from './ingredients.js'

/**
 * The 25 boxes. Each is one of:
 *   locked   — an earlier box still needs closing (the contract's sequential rule)
 *   next     — the box the contract will accept an action on right now
 *   opened   — minted, awaiting close
 *   closed   — done
 *
 * Only the "next" box is clickable, because anything else reverts on-chain.
 * Contents stay hidden until a box is opened, even though `previewRun` could
 * reveal the whole board — the reveal is the game.
 */
export default function BoxGrid({ progress, board, nextAction, busy, onOpen, onClose }) {
  if (!progress?.begun) return null

  const boxes = Array.from({ length: BOXES_PER_RUN }, (_, i) => {
    const opened = (progress.opened >> i) & 1
    const closed = (progress.closed >> i) & 1
    const isNext = nextAction && nextAction.index === i
    const pending = busy === `open:${i}` || busy === `close:${i}`

    let state = 'locked'
    if (closed) state = 'closed'
    else if (opened) state = 'opened'
    else if (isNext) state = 'next'

    return { i, state, opened, closed, isNext, pending }
  })

  return (
    <div className="boxgrid">
      {boxes.map(({ i, state, opened, pending, isNext }) => {
        const ingredient = opened && board ? ingredientFor(board[i]) : null
        const action = !opened ? 'open' : 'close'

        return (
          <button
            key={i}
            className={`box box--${state} ${pending ? 'box--pending' : ''}`}
            disabled={!isNext || !!busy}
            onClick={() => (action === 'open' ? onOpen(i) : onClose(i))}
            title={
              isNext
                ? `${action === 'open' ? 'Open' : 'Close'} box ${i + 1} — 1 signature`
                : state === 'closed'
                  ? `Box ${i + 1}: ${ingredient?.name ?? 'done'}`
                  : `Box ${i + 1} locked`
            }
            style={ingredient ? { '--box-accent': ingredient.color } : undefined}
          >
            {pending ? (
              <span className="box__spinner" />
            ) : ingredient ? (
              <>
                <img className="box__art" src={ingredient.image} alt={ingredient.name} loading="lazy" />
                <span className="box__badge">{ingredient.emoji}</span>
                {state === 'opened' && <span className="box__hint">close</span>}
              </>
            ) : (
              <span className="box__index">{i + 1}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
