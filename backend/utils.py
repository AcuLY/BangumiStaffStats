# 见 bangumi.github.io/api 的 SubjectType
position_ids = [
    # 0 占位, 对齐序号
    {},
    # 1 书籍
    {
        '作者': [2001, 2002],
        '插图': [2003],
        '出版社': [2004],
        '连载杂志': [2005],
        '原作': [2007],
        '人物原案': [2009],
        '脚本': [2010],
        '文库': [2011],
    },
    # 2 动画
    {
        '原作' : [1],
        '导演' : [2],
        '脚本' : [3],
        '分镜' : [4],
        '演出' : [5],
        '音乐' : [6],
        '人物原案' : [7],
        '人物设定' : [8],
        '构图' : [9],
        '系列构成' : [10],
        '美术监督' : [11],
        '色彩设计' : [13],
        '总作画监督' : [14],
        '作画监督' : [15],
        '机械设定' : [16],
        '摄影监督' : [17],
        '监修' : [18],
        '道具设计' : [19],
        '原画' : [20],
        '第二原画' : [21],
        '背景美术' : [25],
        '色彩指定' : [26],
        '剪辑' : [28],
        '原案' : [29],
        '制作管理' : [37],
        '录音' : [39],
        '音响监督' : [44],
        '音效' : [46],
        '特效' : [47],
        '补间动画' : [51],
        '执行制片人' : [52],
        '制片人' : [54, 58],
        '动画制作' : [67],
        'CG 导演' : [69],
        '美术设计' : [71],
        '副导演' : [72],
        '总导演' : [74],
        '摄影' : [82],
        '3DCG' : [75, 86],
        '动画制片人' : [87],
        '声优（仅主役）': [101],
        '声优': [101, 102, 103]
    },
    # 3 音乐
    {
        '艺术家': [3001],
        '制作人': [3002],
        '作曲': [3003],
        '厂牌': [3004],
        '原作': [3005],
        '作词': [3006],
        '录音': [3007],
        '编曲': [3008],
        '插图': [3009],
        '脚本': [3010],
        '出版方': [3011],
        '母带制作': [3012],
        '混音': [3013],
        '乐器': [3014],
        '声乐': [3015],
    },
    # 4 游戏
    {
        '开发': [1001],
        '发行': [1002],
        '游戏设计师': [1003],
        '剧本': [1004],
        '美工': [1005],
        '音乐': [1006],
        '关卡设计': [1007],
        '人物设定': [1008],
        '原画': [1013],
        '动画制作': [1014],
        '原作': [1015],
        '导演': [1016],
        '动画监督': [1017],
        '制作总指挥': [1018],
        '程序': [1021],
        'SD原画': [1024],
        '背景': [1025],
        '监修': [1026],
        '企画': [1028],
        '制作人': [1032]
    },
    # 5 无
    {},
    # 6 三次元
    {
        '原作': [4001],
        '导演': [4002],
        '编剧': [4003],
        '音乐': [4004],
        '执行制片人': [4005],
        '制片人/制作人': [4007],
        '监制': [4008],
        '剪辑': [4012],
        '摄影': [4014],
        '主演': [4016],
        '配角': [4017],
        '制作': [4018],
        '出品': [4019]
    }
]

def extract_name_cn(infobox):
    start = infobox.find("简体中文名=") + len("简体中文名=")

    # 查找可能的结束标记：\r\n、| 或 }
    end_rn = infobox.find("\r\n", start)
    end_pipe = infobox.find("|", start)
    end_brace = infobox.find("}", start)

    # 选择最小的正数作为结束位置
    possible_ends = [end_rn, end_pipe, end_brace]
    end_positions = [pos for pos in possible_ends if pos != -1]  # 过滤掉没有找到的情况 (-1)

    if end_positions:
        end = min(end_positions)  # 选择最早的结束位置
    else:
        end = len(infobox)  # 如果找不到任何结束标记，取到字符串末尾

    return infobox[start:end].strip()

class Subject:
    def __init__(self, subject_name, subject_id, subject_rate, subject_name_cn, subject_image):
        self.name = subject_name
        self.id = subject_id
        self.rate = subject_rate
        self.name_cn = subject_name_cn
        self.image = subject_image
    
    def __repr__(self):
        return f'Subject(name={self.name}, id={self.id}, rate={self.rate}, name_cn={self.name_cn}, image={self.image})'
    
    def __eq__(self, other):
        if isinstance(other, Subject):
            return (self.name == other.name and 
                    self.id == other.id and 
                    self.rate == other.rate and 
                    self.name_cn == other.name_cn and
                    self.image == other.image)
        return False

    def __hash__(self):
        return hash((self.name, self.id, self.rate, self.name_cn, self.image))

class Person:
    def __init__(self, person_name, person_id, person_name_cn):
        self.name = person_name
        self.id = person_id
        self.name_cn = person_name_cn
        
    def __repr__(self):
        return f'Person(name={self.name}, id={self.id}, name_cn={self.name_cn})'
    
    def __eq__(self, other):
        if isinstance(other, Person):
            return (self.name == other.name and 
                    self.id == other.id and 
                    self.name_cn == other.name_cn)
        return False

    def __hash__(self):
        return hash((self.name, self.id, self.name_cn))


class Character:
    def __init__(self, character_id, character_name, character_name_cn, character_image, subject: Subject):
        self.id = character_id
        self.name = character_name
        self.name_cn = character_name_cn
        self.image = character_image
        self.subject = subject
    
    def __eq__(self, other):
        if isinstance(other, Character):
            return (self.name == other.name and 
                    self.id == other.id and 
                    self.name_cn == other.name_cn)
    
    def __hash__(self):
        return hash((self.name, self.id, self.name_cn))

