
position_ids = {
    '导演': 2,
    '总导演': 74,
    '副导演': 72,
    '动画制作': 67,
    '制片人': 54,
    '动画制片人': 87,
    '系列构成': 10,
    '脚本': 3,
    '演出': 5,
    '分镜': 4,
    '总作画监督': 14,
    '作画监督': 15,
    '人物设定': 8,
    '摄影监督': 17,
    '摄影': 82,
    '美术监督': 11,
    '背景美术': 25,
    '音乐': 6,
    '音响监督': 44,
    '音效': 46,
    '原画': 20,
    '第二原画': 21,
    '补间动画': 51,
    '色彩设计': 13,
    '色彩指定': 26,
    'CG 导演': 69,
    '3DCG': 86,
    '特效': 47
}

class Subject:
    def __init__(self, subject_name, subject_id, subject_rate, subject_name_cn):
        self.name = subject_name
        self.id = subject_id
        self.rate = subject_rate
        self.name_cn = subject_name_cn
    
    def __repr__(self):
        return f'Subject(name={self.name}, id={self.id}, rate={self.rate}, name_cn={self.name_cn})'

class Person:
    def __init__(self, person_name, person_id, person_name_cn):
        self.name = person_name
        self.id = person_id
        self.name_cn = person_name_cn
        
    def __repr__(self):
        return f'Person(name={self.name}, id={self.id}, name_cn={self.name_cn})'
    

