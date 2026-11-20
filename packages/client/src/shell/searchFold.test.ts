import { describe, expect, it } from 'vitest'
import { foldsSearch, searchBoxWidth } from './searchFold.js'

// 1300px window, 1244px bar: the box is 390px, so the centered title column is (1208 - 390 - 24) / 2 = 397.
const centered = { headerWidth: 1244, viewportWidth: 1300, leftWidth: 397 }

describe('foldsSearch', () => {
  it('keeps the box when the bar has no strip', () => {
    expect(foldsSearch({ ...centered, strips: [] })).toBe(false)
  })

  it('keeps the box while the tabs fit at their minimum width', () => {
    expect(foldsSearch({ ...centered, strips: [{ clientWidth: 200, minContentWidth: 200 }] })).toBe(
      false,
    )
  })

  it('folds when the tabs need more than the centered column gives', () => {
    expect(foldsSearch({ ...centered, strips: [{ clientWidth: 200, minContentWidth: 260 }] })).toBe(
      true,
    )
  })

  it('stays folded while unfolding would crowd the tabs again', () => {
    // Folded, the column grew by 300px and the strip with it; the tabs still need 60px more than centered gives.
    const folded = { ...centered, leftWidth: 697 }
    expect(foldsSearch({ ...folded, strips: [{ clientWidth: 500, minContentWidth: 260 }] })).toBe(
      true,
    )
  })

  it('unfolds once the tabs would fit centered', () => {
    const folded = { ...centered, leftWidth: 697 }
    expect(foldsSearch({ ...folded, strips: [{ clientWidth: 500, minContentWidth: 190 }] })).toBe(
      false,
    )
  })

  it('never folds below the width where the box opens', () => {
    expect(
      foldsSearch({
        headerWidth: 800,
        viewportWidth: 850,
        leftWidth: 100,
        strips: [{ clientWidth: 50, minContentWidth: 400 }],
      }),
    ).toBe(false)
  })
})

describe('searchBoxWidth', () => {
  it('is 30% of the window between 240 and 440', () => {
    expect(searchBoxWidth(600)).toBe(240)
    expect(searchBoxWidth(1300)).toBe(390)
    expect(searchBoxWidth(2000)).toBe(440)
  })
})
