import { SUBJECT_TYPE, type SubjectType } from "@/constants/types"

export const calcActionName = (subjectType: SubjectType): string => {
	switch (subjectType) {
		case SUBJECT_TYPE.BOOK:
		case SUBJECT_TYPE.ANIME:
		case SUBJECT_TYPE.REAL:
			return '看'
		case SUBJECT_TYPE.MUSIC:
			return '听'
		case SUBJECT_TYPE.GAME:
			return '玩'
	}
	return '看'
}