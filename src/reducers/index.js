import { combineReducers } from 'redux'
import { handleActions } from 'redux-actions'
import { createSelector } from 'reselect'
// import pick from 'lodash/pick'
import get from 'lodash/get'
import range from 'lodash/range'

import { containerDims } from '../constants.js'

const sortedSlotnames = [].concat.apply( // flatten
  [],
  [1, 2, 3].map(num => ['A', 'B', 'C', 'D', 'E'].map(letter => letter + num))
)

// HACK DEBUG

const defaultIngredients = [
  {
    name: 'Blood Samples',

    wells: ['C2', 'C3', 'C4'],
    wellDetails: {
      C3: { volume: 100, concentration: 10, name: 'Special Sample' }
    },

    volume: 20, // required. in uL
    concentration: null, // optional number, a %
    description: 'blah', // optional string

    individualized: true // when false, ignore wellDetails
    // (we should probably delete wellDetails if individualized is set false -> true)
  },
  {
    name: 'Control',
    wells: ['A1'],
    wellDetails: null,
    volume: 50,
    concentration: null,
    description: '',
    individualized: false
  },
  {
    name: 'Buffer',
    wells: ['H1', 'H2', 'H3', 'H4'],
    wellDetails: null,
    volume: 100,
    concentration: 50,
    description: '',
    individualized: false
  }
]

// UTILS

const nextEmptySlot = loadedContainersSubstate => {
  // Next empty slot in the sorted slotnames order. Or null if no more slots.
  const nextEmptySlotIdx = sortedSlotnames.findIndex(slot => !(slot in loadedContainersSubstate))
  return nextEmptySlotIdx >= sortedSlotnames.length ? null : sortedSlotnames[nextEmptySlotIdx]
}

// REDUCERS

const modeLabwareSelection = handleActions({
  OPEN_LABWARE_SELECTOR: (state, action) => true,
  CLOSE_LABWARE_SELECTOR: (state, action) => false,
  SELECT_LABWARE_TO_ADD: (state, action) => false // close window when labware is selected
}, false)

const modeIngredientSelection = handleActions({
  OPEN_INGREDIENT_SELECTOR: (state, action) => ({slotName: action.payload.slotName, selectedIngredientGroup: null}),
  EDIT_MODE_INGREDIENT_GROUP: (state, action) => ({...state, selectedIngredientGroup: action.payload}),
  EDIT_INGREDIENT: (state, action) => ({...state, selectedIngredientGroup: null}), // unselect ingredient group when edited.
  CLOSE_INGREDIENT_SELECTOR: (state, action) => null
}, null)

const loadedContainers = handleActions({
  SELECT_LABWARE_TO_ADD: (state, action) => ({...state, [nextEmptySlot(state)]: action.payload}),
  DELETE_CONTAINER_AT_SLOT: (state, action) => {
    // For leaving open slots functionality, do this one-liner instead
    // return pickBy(state, (value, key) => key !== action.payload)}

    const deletedSlot = action.payload
    const deletedIdx = sortedSlotnames.findIndex(slot => slot === deletedSlot)
    // Summary:
    //  {A1: 'alex', B1: 'brock', C1: 'charlie'} ==(delete slot B1)==> {A1: 'alex', B1: 'charlie'}
    const nextState = sortedSlotnames.reduce((acc, slotName, i) => slotName === deletedSlot || !(slotName in state)
      ? acc
      : ({...acc, [sortedSlotnames[i < deletedIdx ? i : i - 1]]: state[slotName]}),
      {})
    console.log(nextState)
    return nextState
  }
}, {})

const selectedWellsInitialState = {preselected: {}, selected: {}}
const selectedWells = handleActions({
  PRESELECT_WELLS: (state, action) => action.payload.append
    ? {...state, preselected: action.payload.wells} : {selected: {}, preselected: action.payload.wells},
  SELECT_WELLS: (state, action) => ({
    preselected: {},
    selected: {
      ...(action.payload.append ? state.selected : {}),
      ...action.payload.wells
    }
  }),
  DESELECT_WELLS: () => selectedWellsInitialState,
  CLOSE_INGREDIENT_SELECTOR: () => selectedWellsInitialState,
  EDIT_MODE_INGREDIENT_GROUP: (state, action) => ({selected: action.payload.selectedWells, preselected: {}})
}, selectedWellsInitialState)

const ingredients = handleActions({
  EDIT_INGREDIENT: (state, action) => (
    (action.payload.groupId !== undefined && action.payload.groupId !== null)
      // Modify existing ingredient
      ? state
      // No groupId, create new ingredient
      : state.concat({
        name: action.payload.name,
        volume: action.payload.volume,
        concentration: action.payload.concentration,
        description: action.payload.description,
        individualized: action.payload.individualized, // TODO!

        wells: action.payload.wells || ['A1', 'A2'] // TODO!
      })
  ),
  // Remove the deleted group (referenced by array index)
  DELETE_INGREDIENT_GROUP: (state, action) => state.filter((_, i) => i !== action.payload.group)
}, defaultIngredients)

const rootReducer = combineReducers({
  modeLabwareSelection,
  modeIngredientSelection,
  loadedContainers,
  selectedWells,
  ingredients
})

// SELECTORS

const rootSelector = state => state.default

const activeModals = createSelector(
  rootSelector,
  state => ({
    labwareSelection: state.modeLabwareSelection,
    ingredientSelection: state.modeIngredientSelection && {
      slotName: state.modeIngredientSelection.slotName,
      // "mix in" selected containerName from loadedContainers
      containerName: state.loadedContainers[state.modeIngredientSelection.slotName]}
  })
)

const loadedContainersBySlot = createSelector(
  rootSelector,
  state => state.loadedContainers
)

const canAdd = createSelector(
  loadedContainersBySlot,
  loadedContainers => nextEmptySlot(loadedContainers)
)

const selectedSlot = createSelector(
  rootSelector,
  state => state.modeIngredientSelection.slotName
)

const wellMatrix = createSelector(
  selectedSlot,
  loadedContainersBySlot,
  state => rootSelector(state).selectedWells,
  (modeIngredientSelection, loadedContainers, selectedWells) => {
    const containerType = loadedContainers[modeIngredientSelection.slotName] // TODO: DRY this up
    const { rows, columns } = containerDims[containerType] || {rows: 12, columns: 8}

    if (!(containerType in containerDims)) {
      console.warn(`wellMatrix selector sez: no info in containerDims for "${containerType}", falling back to 8x12`)
    }

    return range(rows - 1, -1, -1).map(
      rowNum => range(columns).map(
        colNum => {
          const wellKey = colNum + ',' + rowNum // Key in selectedWells from getCollidingWells fn
          return {
            number: rowNum * columns + colNum + 1,
            preselected: wellKey in selectedWells.preselected,
            selected: wellKey in selectedWells.selected
          }
        }
      )
    )
  }
)

const allIngredients = createSelector(
  rootSelector,
  state => state.ingredients
)

const selectedWellNames = createSelector(
  state => rootSelector(state).selectedWells.selected,
  selectedWells => Object.values(selectedWells).map(well => {
    console.log({selectedWells, rr: Object.values(selectedWells), well})
    const col = well[0]
    const row = well[1]
    return String.fromCharCode(65 + col) + (row + 1)
  }) // TODO factor to util
)

const numWellsSelected = createSelector(
  state => rootSelector(state).selectedWells,
  selectedWells => Object.keys(selectedWells.selected).length)

// Currently selected container's slot (labware view, aka ingredient selection mode)
const selectedContainerSlot = createSelector(
  rootSelector,
  state => state.modeIngredientSelection.slotName
)

const ingredientGroupsForSelectedContainer = createSelector(
  allIngredients,
  selectedContainerSlot,
  (allIngredients, selectedContainerSlot) => {
    return allIngredients.filter(ingredGroup =>
      ingredGroup &&
      ingredGroup.locations &&
      selectedContainerSlot in ingredGroup.locations
    )
  }
)

// returns selected group id (index in array of all ingredients), or undefined.
const selectedIngredientGroupId = createSelector(
  rootSelector,
  state => get(state, 'modeIngredientSelection.selectedIngredientGroup.group')
)

const selectedIngredientGroup = createSelector(
  selectedIngredientGroupId,
  allIngredients,
  (ingredGroupId, allIngredients) => (allIngredients.length - 1 >= ingredGroupId)
    ? allIngredients[ingredGroupId]
    : null
)

const selectedIngredientProperties = createSelector(
  selectedIngredientGroup,
  ingredGroup => ingredGroup // ingredGroup may be null or undefined
    ? {
      volume: ingredGroup.volume,
      concentration: ingredGroup.concentration,
      name: ingredGroup.name
    }
    : {}
)

export const selectors = {
  activeModals,
  loadedContainersBySlot,
  canAdd,
  wellMatrix,
  numWellsSelected,
  selectedWellNames,
  ingredients: state => state.default.ingredients, // TODO
  selectedContainerSlot,
  ingredientGroupsForSelectedContainer,
  selectedIngredientProperties,
  selectedIngredientGroupId
}

export default rootReducer
