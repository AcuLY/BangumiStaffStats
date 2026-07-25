// Code generated from contracts/goldens/query/unicode/DerivedAge-15.1.0.txt.
// DO NOT EDIT.

package query

import (
	"unicode"

	"golang.org/x/text/unicode/rangetable"
)

// Unicode 15.1 added exactly three character ranges to the Unicode 15.0
// assigned set. The remainder of this delta restores the noncharacter ranges
// that DerivedAge declares assigned but x/text intentionally omits. Keeping
// the delta here lets the pinned x/text table carry older ranges without
// silently admitting scalars introduced after 15.1.
var unicodeAssigned15_1 = rangetable.Merge(
	rangetable.Assigned("15.0.0"),
	&unicode.RangeTable{
		R16: []unicode.Range16{
			{Lo: 0x2ffc, Hi: 0x2fff, Stride: 1},
			{Lo: 0x31ef, Hi: 0x31ef, Stride: 1},
			{Lo: 0xfdd0, Hi: 0xfdef, Stride: 1},
			{Lo: 0xfffe, Hi: 0xffff, Stride: 1},
		},
		R32: []unicode.Range32{
			{Lo: 0x1fffe, Hi: 0x1ffff, Stride: 1},
			{Lo: 0x2ebf0, Hi: 0x2ee5d, Stride: 1},
			{Lo: 0x2fffe, Hi: 0x2ffff, Stride: 1},
			{Lo: 0x3fffe, Hi: 0x3ffff, Stride: 1},
			{Lo: 0x4fffe, Hi: 0x4ffff, Stride: 1},
			{Lo: 0x5fffe, Hi: 0x5ffff, Stride: 1},
			{Lo: 0x6fffe, Hi: 0x6ffff, Stride: 1},
			{Lo: 0x7fffe, Hi: 0x7ffff, Stride: 1},
			{Lo: 0x8fffe, Hi: 0x8ffff, Stride: 1},
			{Lo: 0x9fffe, Hi: 0x9ffff, Stride: 1},
			{Lo: 0xafffe, Hi: 0xaffff, Stride: 1},
			{Lo: 0xbfffe, Hi: 0xbffff, Stride: 1},
			{Lo: 0xcfffe, Hi: 0xcffff, Stride: 1},
			{Lo: 0xdfffe, Hi: 0xdffff, Stride: 1},
			{Lo: 0xefffe, Hi: 0xeffff, Stride: 1},
			{Lo: 0xffffe, Hi: 0xfffff, Stride: 1},
			{Lo: 0x10fffe, Hi: 0x10ffff, Stride: 1},
		},
	},
)
