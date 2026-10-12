// Token ids match IngredientNFT. Ids 1-4 are the recipe; 5 and 6 are junk that
// createPotion burns automatically.
export const INGREDIENTS = {
  1: { id: 1, name: 'Water', useful: true, emoji: '💧', color: '#4aa8ff', image: '/ingredients/water.jpg' },
  2: { id: 2, name: 'Crystalix', useful: true, emoji: '💎', color: '#b98cff', image: '/ingredients/crystalix.jpg' },
  3: { id: 3, name: 'Sunfiber', useful: true, emoji: '🌾', color: '#ffc94a', image: '/ingredients/sunfiber.jpg' },
  4: { id: 4, name: 'Coppervein', useful: true, emoji: '🪨', color: '#ff8a4a', image: '/ingredients/coppervein.jpg' },
  5: { id: 5, name: 'Stone', useful: false, emoji: '⬜', color: '#8a8f98', image: '/ingredients/stone.jpg' },
  6: { id: 6, name: 'Poison', useful: false, emoji: '☠️', color: '#5f6a76', image: '/ingredients/poison.jpg' },
}

export const RECIPE = [1, 2, 3, 4]
export const BOXES_PER_RUN = 25
export const POTION_IMAGE = '/potion.jpg'

export function ingredientFor(id) {
  return INGREDIENTS[Number(id)] ?? { id: 0, name: 'Unknown', useful: false, emoji: '❓', color: '#666' }
}
