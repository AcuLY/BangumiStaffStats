package statistics

import (
	"math"
	"math/big"
	"strconv"
)

type decimal struct {
	value *big.Rat
}

func decimalFromFloat(value float64) (decimal, bool, error) {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return decimal{}, false, outcome(CodeScoreInvalid)
	}
	if value == 0 {
		return decimal{}, false, nil
	}
	if value < 1 || value > 10 {
		return decimal{}, false, outcome(CodeScoreInvalid)
	}
	text := strconv.FormatFloat(value, 'f', -1, 64)
	rational, ok := new(big.Rat).SetString(text)
	if !ok {
		return decimal{}, false, outcome(CodeScoreInvalid)
	}
	return decimal{value: rational}, true, nil
}

func decimalFromHundredths(value int64) decimal {
	return decimal{value: new(big.Rat).SetFrac(big.NewInt(value), big.NewInt(100))}
}

func averageHundredths(values []decimal) (int64, error) {
	if len(values) == 0 {
		return 0, outcome(CodeInputInvalid)
	}
	sum := new(big.Rat)
	for _, value := range values {
		if value.value == nil {
			return 0, outcome(CodeInputInvalid)
		}
		sum.Add(sum, value.value)
	}
	sum.Quo(sum, new(big.Rat).SetInt64(int64(len(values))))
	scaled := new(big.Rat).Mul(sum, new(big.Rat).SetInt64(100))
	quotient := new(big.Int).Quo(scaled.Num(), scaled.Denom())
	if !quotient.IsInt64() {
		return 0, outcome(CodeInputInvalid)
	}
	return quotient.Int64(), nil
}

func positiveHalfUp(numerator, denominator *big.Int) (int64, error) {
	if numerator.Sign() < 0 || denominator.Sign() <= 0 {
		return 0, outcome(CodeInputInvalid)
	}
	adjusted := new(big.Int).Lsh(new(big.Int).Set(numerator), 1)
	adjusted.Add(adjusted, denominator)
	divisor := new(big.Int).Lsh(new(big.Int).Set(denominator), 1)
	result := new(big.Int).Quo(adjusted, divisor)
	if !result.IsInt64() {
		return 0, outcome(CodeInputInvalid)
	}
	return result.Int64(), nil
}

func overallHundredths(average int64, ratedCount int) (int64, error) {
	if average < 0 || ratedCount <= 0 {
		return 0, outcome(CodeInputInvalid)
	}
	count := big.NewInt(int64(ratedCount))
	numerator := new(big.Int).Mul(count, big.NewInt(average))
	numerator.Add(numerator, big.NewInt(2500))
	denominator := new(big.Int).Add(count, big.NewInt(5))
	return positiveHalfUp(numerator, denominator)
}

func distributionBucket(value decimal) (int, error) {
	if value.value == nil {
		return 0, outcome(CodeInputInvalid)
	}
	scaled := new(big.Rat).Add(value.value, new(big.Rat).SetFrac64(1, 2))
	index := new(big.Int).Quo(scaled.Num(), scaled.Denom())
	if !index.IsInt64() {
		return 0, outcome(CodeInputInvalid)
	}
	bucket := index.Int64()
	if bucket < 1 {
		bucket = 1
	}
	if bucket > 10 {
		bucket = 10
	}
	return int(bucket), nil
}
