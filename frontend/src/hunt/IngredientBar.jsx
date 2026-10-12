import { INGREDIENTS, RECIPE, ingredientFor } from './ingredients.js'

/**
 * Held ingredients, recipe first.
 *
 * Every board contains exactly one of each useful ingredient by construction,
 * so clearing all 25 boxes always yields a craftable recipe — the bar is
 * progress feedback, not a puzzle to solve.
 */
export default function IngredientBar({ balances }) {
  if (!balances) return null

  const held = (id) => Number(balances[id - 1] ?? 0n)
  const recipeComplete = RECIPE.every((id) => held(id) === 1)
  const junkIds = [5, 6].filter((id) => held(id) > 0)

  return (
    <div className="ingredients">
      <div className="ingredients__head">
        <span className="ingredients__title">Ingredient Inventory</span>
        <span className={recipeComplete ? 'pill pill--good' : 'pill'}>
          {recipeComplete ? 'Recipe complete' : `Recipe ${RECIPE.filter((id) => held(id) > 0).length}/4`}
        </span>
      </div>

      <div className="ingredient-grid">
        {RECIPE.map((id) => {
          const ing = ingredientFor(id)
          const count = held(id)
          const found = count > 0
          return (
            <div
              key={id}
              className={`ingredient-card ${found ? 'ingredient-card--found' : ''}`}
              style={{ '--ing-accent': ing.color }}
              title={`${ing.name}: ${count}`}
            >
              <div className="ingredient-card__art">
                <img src={ing.image} alt={ing.name} loading="lazy" />
                <span className="ingredient-card__badge">{ing.emoji}</span>
                {found && count > 1 && <span className="ingredient-card__count">×{count}</span>}
              </div>
              <span className="ingredient-card__name">{ing.name}</span>
            </div>
          )
        })}
      </div>

      {!recipeComplete && <p className="note note--small">Keep opening boxes to find all 4 ingredients.</p>}

      {junkIds.length > 0 && (
        <div className="junk-row">
          {junkIds.map((id) => {
            const ing = ingredientFor(id)
            const count = held(id)
            return (
              <div key={id} className="junk-row__item" title={ing.name}>
                <img src={ing.image} alt={ing.name} className="junk-row__thumb" />
                <span>
                  {ing.name} ×{count}
                </span>
              </div>
            )
          })}
          <span className="note note--small junk-row__note">auto-burned on craft</span>
        </div>
      )}
    </div>
  )
}
