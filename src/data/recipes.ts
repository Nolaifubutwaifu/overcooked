import type { Recipe } from '../types.ts';

// Difficulty tiers (rewards):
//   easy   $20  one or two basic chops
//   med    $30  chop + cook combined, or pot soup (single ingredient)
//   hard   $45  three components or multi-ingredient soup
export const RECIPES: Recipe[] = [
  {
    id: 'salad',
    name: 'Salad',
    requirements: [
      { type: 'ingredient', kind: 'tomato', state: 'chopped' },
      { type: 'ingredient', kind: 'lettuce', state: 'chopped' },
    ],
    reward: 20,
  },
  {
    id: 'steak',
    name: 'Steak',
    requirements: [{ type: 'ingredient', kind: 'meat', state: 'cooked' }],
    reward: 20,
  },
  {
    id: 'onion-soup',
    name: 'Onion Soup',
    requirements: [{ type: 'soup', ingredients: ['onion'] }],
    reward: 30,
  },
  {
    id: 'tomato-soup',
    name: 'Tomato Soup',
    requirements: [{ type: 'soup', ingredients: ['tomato'] }],
    reward: 30,
  },
  {
    id: 'steak-salad',
    name: 'Steak Salad',
    requirements: [
      { type: 'ingredient', kind: 'meat', state: 'cooked' },
      { type: 'ingredient', kind: 'tomato', state: 'chopped' },
      { type: 'ingredient', kind: 'lettuce', state: 'chopped' },
    ],
    reward: 45,
  },
  {
    id: 'veggie-soup',
    name: 'Veggie Soup',
    requirements: [{ type: 'soup', ingredients: ['onion', 'tomato'] }],
    reward: 50,
  },
  {
    id: 'burger',
    name: 'Burger',
    requirements: [
      { type: 'ingredient', kind: 'bun', state: 'raw' },
      { type: 'ingredient', kind: 'meat', state: 'cooked' },
      { type: 'ingredient', kind: 'lettuce', state: 'chopped' },
      { type: 'ingredient', kind: 'tomato', state: 'chopped' },
    ],
    reward: 55,
  },
];

export function recipeById(id: string): Recipe {
  const r = RECIPES.find((r) => r.id === id);
  if (!r) throw new Error(`Unknown recipe: ${id}`);
  return r;
}

// Recipes used in a given level. For now: all of them.
export function recipesForLevel(_levelId: string) {
  return RECIPES;
}
