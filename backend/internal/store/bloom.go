package store

import (
	"fmt"

	"github.com/bits-and-blooms/bloom/v3"
)

var subjectFilter *bloom.BloomFilter

func SubjectExists(id int) bool {
	return subjectFilter.Test(fmt.Append(nil, id))
}