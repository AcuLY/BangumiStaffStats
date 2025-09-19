package model

type HasID interface {
	GetID() int
}

type HasKey interface {
	Key() string
}

func ToIDs[T HasID](objs []T) []int {
	ids := make([]int, 0, len(objs))
	for _, obj := range objs {
		ids = append(ids, obj.GetID())
	}
	return ids
}

func ToIDMap[T HasID](objs []T) map[int]T {
	idMap := make(map[int]T, len(objs))
	for _, obj := range objs {
		idMap[obj.GetID()] = obj
	}
	return idMap
}

func FromIDMap[T HasID](m map[int]T) []T {
	objs := make([]T, 0, len(m))
	for _, obj := range m {
		objs = append(objs, obj)
	}
	return objs
}

func ToKeyMap[T HasKey](objs []T) map[string]T {
	keyMap := make(map[string]T, len(objs))
	for _, obj := range objs {
		keyMap[obj.Key()] = obj
	}
	return keyMap
}

func Keys[T comparable, U any](m map[T]U) []T {
	keys := make([]T, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

func Values[T comparable, U any](m map[T]U) []U {
	vals := make([]U, 0, len(m))
	for _, v := range m {
		vals = append(vals, v)
	}
	return vals
}

func ValuesFlatten[T comparable, U comparable](m map[T][]U) []U {
	valSet := make(map[U]struct{}, 0)
	for _, vs := range m {
		for _, v := range vs {
			valSet[v] = struct{}{}
		}
	}

	vals := make([]U, 0, len(valSet))
	for v := range valSet {
		vals = append(vals, v)
	}
	return vals
}
