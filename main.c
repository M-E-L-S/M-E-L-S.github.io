#include <math.h>
#include <stdio.h>
#include <time.h>
#include <windows.h>
#define MAX 20
#define OPERATOR_CNT 6
#define ATK_SPEED_RELIC_CNT 27
#define ATK_POWER_RELIC_CNT 37
#define ADD_MUL_RELIC_CNT 10
#define MUL_MUL_RELIC_CNT 1
#define FRAGILE_RELIC_CNT 14
#define TRY 10000000

double AtkSpeed, Atk[6][MAX], Sum;//面版乘算，倍率乘算叠加，倍率乘算叠乘，脆弱乘算叠乘
int Boss;
double ElementFragile;

struct AtkSpeedRelic{
    double atkSpeed;
    char name[30];
} AtkSpeedRelicTable[] = {{30,"折戟-破釜沉舟"},{70,"残弩-神速"},{25,{"断杖-织法者"}},{50,"医者-妙手"},
{30,"锈刃-研磨"},{7,"凉拌海草"},{8,"咖啡平原咖啡糖"},{6,"古旧乐谱残章"},{35,"私人巫术终端"}
    ,{35,"火海"},{15,"异族"},{100,"死斗"},{40,"疗养体验卡"},{70,"疗养特供卡"}
    ,{20,"断杖-波纹之手"},{50,"国王的新枪"},{30,"魔王的旗帜"},{50,"丝契之谜"},{50,"背誓"}
    ,{-15,"眼熟的雕像"},{30,"滚动先祖"}
    ,{6,"远程协议-克敌"},{6,"破坏协议-压制"},{5,"Friston.P"}
    ,{3,"投币玩具"},{5,"骑士戒律·新编"},{7,"金酒之杯"}};

struct MulAddRelic{//乘算叠加
    double mulValue;
    char name[40];
} MulAddRelicTable[] = {{0.15,"皇帝的恩宠"},{0.25,"贵族刺剑"},{0.35,"老近卫军之锋"},{0.15,"显圣吊坠"}
    ,{0.25,"银餐叉"},{0.35,"损坏的左轮弹巢"},{0.5,"钝爪-百战"},{0.25,"折戟-锋刃"},{0.4,"折戟-破釜沉舟"}
,{0.6,"铁卫-侵略"},{0.2,"残弩-百步穿杨"},{0.4,"残弩-交叉火力"},{0.25,"断杖-织法者"},{0.07,"橙味风暴"}
,{0.08,"尖叫樱桃"},{0.07,"皮特水果什锦"},{0.07,"解约协议"},{0.3,"空羽兽"},{1,"几丁质刺刀"},{0.2,"死仇时代的恨意"}
,{0.5,"无惧之刃"},{0.1,"抢夺"},{0.2,"侵略"},{0.3,"兴亡"},{0.2,"矛头分队"},{0.2,"历史重构"}
,{0.1,"统帅肖像(1普通，3关底)"},{0.08,"突击协议-利刃"},{0.08,"堡垒协议-方阵"},{0.08,"远程协议-遥击"},{0.08,"破坏协议-消除"},{0.1,"老蒲扇"}
,{0.05,"生命熔炉之薪"},{0.03,"束灵骨"},{0.05,"圆石祭坛"},{0.05,"佣兵的饰物"},{0.2,"生还者合约"}};

struct GlobalMulAddRelic{//乘算叠加
    double mulValue;
    char name[40];
} GlobalMulAddRelicTable[] = {{1,"荣耀绶带"},{0.3,"古乔治营养原浆"},{0.7,"锈刃-遗世独立"},{0.2,"支柱-援护"},{1.5,"轰鸣之手"}
    ,{0.5,"诸王的冠冕(1一件，3三件)"}
    ,{0.2,"岩角号"},{0.25,"久居之手"},{0.1,"掠食之手"},{0.08,"折戟-裂岩"}};

struct GlobalMulMulRelic{//乘算叠乘
    double mulValue;
    char name[30];
} GlobalMulMulRelicTable[] = {{0.75,"宁静之谜"}};

struct GlobalFragileRelic{//防御之后结算，同行叠加，不同行叠乘
    double mulValue;
    char name[30];
} GlobalFragileRelicTable[] = {{0.15,"锈蚀刀片"},{0.25,"赶车夫的长鞭"},{0.35,"复仇者"}
    ,{0.2,"灾难之源"},{0.1,"讴歌者面纱"},{0.2,"制式防爆用具"},{0.3,"皇帝的收藏"},{0.4,"璀璨悲泣"}
,{1,"Scout的狙击镜"}
,{0.7,"断杖-苦难巫咒"}
,{1.5,"文明的存续"}
,{0.5,"文学的开端"}
,{0.5,"奴隶诱捕器"}
,{0.12,"断杖-波纹"}};

struct Operator{
    char name[30];
    double atk;//面板攻击力
    double skillDuration[6];//持续时间
    double skillMul[6][4];//面版乘算，直接乘算叠加，最终乘算叠乘，脆弱乘算叠乘
    double atkSpeed;//面板攻击速度
    double atkInterval;//攻击间隔
    double atkCount[6];//攻击次数
    bool damageType[3];//物理，法术，元素伤害类型
    double ignoreDef[3];//防御力，法抗，元素抗性削减、无视
} OperatorList[] = {{"维什戴尔2",874,{12.5,12.5,12.5,12.5,12.5,12.5},{{0.35,0,1.25,1},{0.35,0,0.625,1},{0.35,0,1,1},{0.35,0,0.5,1},{0.35,0,1.85,1},{0.35,0,1.85,1}},100.0,1.4,{1,2,4,8,0.2775,1.11},{1,0,0},{0,0,0}}
,{"寒芒克洛丝2",608,{30,30,0,0},{{0,0,1,1},{0,0,0.75,1},{0,0,1,-1},{0,0,0.75,-1}},100,0.625,{4,0.8,32,6.4},{1,0,0},{0,0,0}}
,{"逻各斯3",855,{30,30,30},{{3,0,1,1},{3,0,0.6,1},{3,0,0.6,1}},100,1.6,{1,1,1},{0,1,1},{0,10,0}}
,{"能天使3",700,{15},{0.1,0,1.1,1},123,0.78,{5},{1,0,0},{250,0,0}}
,{"荒芜拉普兰德3",460,{16,24,0,40},{{0.8,0,1.1,1},{0.8,0,1.21,1},{0.8,0,1.2,1},{0.8,0,1,1}},110,1.3,{3,3,40,1},{0,1,0},{0,0,0}},
{"号角3",1136,{12,12},{{1.01,0,1,1},{1.71,0,1,1}},100,1,{1,1},{1,0,0},{0,0,0}}
};

void HandleSpecialCase(double res);//逻各斯枚举特判函数

void SelectAtkSpeedRelic(void){
    //攻速藏品读入
    int times = 1;
    int num;
    int mode = 1;
    printf("请选择攻速藏品(输入序号和藏品所需数量):\n");
    for(int i=0;i<ATK_SPEED_RELIC_CNT;i++){
        printf("%d %s\n",i,AtkSpeedRelicTable[i].name);
    }
    printf("输入-1以停止输入，输入-2进入删除模式。\n");
    while(1){
        scanf("%d",&num);
        if(num == -2){
            mode = -1;
            scanf("%d",&num);
        }
        if(num == -1){break;}
        if(num >= 21 && num <24){scanf("%d",&times);}
        if(num >= 24){scanf("%d",&times);times /= 5;}
        AtkSpeed += mode * AtkSpeedRelicTable[num].atkSpeed * times;
        times = 1;
    }
}

void SelectMulAddRelic(void){
    //面板乘算藏品
    int num;
    int times = 1;
    int mode = 1;
    printf("请选择一类藏品(序号和藏品所需数量):\n");
    for(int i=0;i<ATK_POWER_RELIC_CNT;i++){
        printf("%d %s\n",i,MulAddRelicTable[i].name);
    }
    printf("输入-1以停止输入，输入-2进入删除模式。\n");
    while(1){
        scanf("%d",&num);
        if(num == -2){
            mode = -1;
            scanf("%d",&num);
        }
        if(num == -1){break;}
        if(num >= 26){scanf("%d",&times);}
        for(int i=0;i<6;i++){Atk[i][0] += mode * MulAddRelicTable[num].mulValue * times;}
        times = 1;
    }
}

void SelectGlobalMulAddRelic(void){
    //倍率乘算叠加藏品
    int num;
    int times = 1;
    int mode = 1;
    printf("请选择二类藏品(序号和藏品所需数量):\n");
    for(int i=0;i<ADD_MUL_RELIC_CNT;i++){
        printf("%d %s\n",i,GlobalMulAddRelicTable[i].name);
    }
    printf("输入-1以停止输入，输入-2进入删除模式。\n");
    while(1){
        scanf("%d",&num);
        if(num == -2){
            mode = -1;
            scanf("%d",&num);
        }
        if(num == -1){break;}
        if(num >= 5){scanf("%d",&times);}
        for(int i=0;i<6;i++){Atk[i][1] += mode * GlobalMulAddRelicTable[num].mulValue * times;}
        times = 1;
    }
}

void SelectGlobalMulMulRelic(void){
    //倍率乘算叠乘藏品
    int num;
    printf("请选择三类藏品(序号):\n");
    for(int i=0;i<MUL_MUL_RELIC_CNT;i++){
        printf("%d %s\n",i,GlobalMulMulRelicTable[i].name);
    }
    printf("输入-1以停止输入。\n");
    while(1){
        scanf("%d",&num);
        if(num == -1){break;}
        for(int i=0;i<6;i++){
            Atk[i][2] *= GlobalMulMulRelicTable[num].mulValue;
        }
    }
}

void SelectGlobalFragileRelic(void){
    //脆弱乘算藏品
    int num;
    int times = 1;
    int mode = 1;
    printf("请选择四类藏品(序号和藏品所需数量):\n");
    for(int i=0;i<FRAGILE_RELIC_CNT;i++){
        printf("%d %s\n",i,GlobalFragileRelicTable[i].name);
    }
    printf("输入-1以停止输入，输入-2进入删除模式。\n");
    while(1){
        scanf("%d",&num);
        if(num == -2){
            mode = -1;
            scanf("%d",&num);
        }
        if(num == -1){break;}
        switch(num){
            case 0:;
            case 1:;
            case 2:for(int i=0;i<6;i++){Atk[i][4] += mode * GlobalFragileRelicTable[num].mulValue;}break;
            case 3:ElementFragile += 0.5;
            case 4:ElementFragile += 0.5;
            case 5:;
            case 6:;
            case 7:for(int i=0;i<6;i++){Atk[i][5] += mode * GlobalFragileRelicTable[num].mulValue;}break;
            case 8:for(int i=0;i<6;i++){Atk[i][6] += mode * GlobalFragileRelicTable[num].mulValue;}break;
            case 9:for(int i=0;i<6;i++){Atk[i][7] += mode * GlobalFragileRelicTable[num].mulValue;}break;
            case 10:for(int i=0;i<6;i++){Atk[i][8] += mode * GlobalFragileRelicTable[num].mulValue;}break;
            case 11:for(int i=0;i<6;i++){Atk[i][9] += mode * GlobalFragileRelicTable[num].mulValue;}break;
            case 12:for(int i=0;i<6;i++){Atk[i][10] += mode * GlobalFragileRelicTable[num].mulValue;}break;
            case 13:scanf("%d",&times);for(int i=0;i<6;i++){Atk[i][11] += mode * GlobalFragileRelicTable[num].mulValue * times;}break;
            default: ;
        }
        times = 1;
    }
}

int main(void){
    SetConsoleOutputCP(65001);
    while(1){
        ElementFragile = 0;
        for(int i=0;i<6;i++){
            for(int j=0;j<MAX;j++){
                Atk[i][j] = 1.0;
            }
        }

        //干员数据读入
        printf("请选择干员(仅输入序号，输入-1退出):\n");
        for(int i=0;i<OPERATOR_CNT;i++){
            printf("%d %s\n",i,OperatorList[i].name);
        }
        int OperatorIndex;
        scanf("%d",&OperatorIndex);

        //拉普兰德特判
        if(OperatorIndex == 4){
            printf("请选择天赋暖机层数:\n0\n1 伤害上限提高10%%\n3 浮游单元+1\n");
            int StackCount;
            scanf("%d",&StackCount);
            if(StackCount >= 1){OperatorList[4].skillMul[0][2] = 1.21;}
            if(StackCount == 3){OperatorList[4].atkCount[0] = 4;OperatorList[4].atkCount[1] = 4;}
        }

        if(OperatorIndex == -1){break;}
        for(int j=0;j<6;j++){
            Atk[j][0] += OperatorList[OperatorIndex].skillMul[j][0];
            Atk[j][1] += OperatorList[OperatorIndex].skillMul[j][1];
            if(OperatorList[OperatorIndex].skillMul[j][2] != 0)Atk[j][2] *= OperatorList[OperatorIndex].skillMul[j][2];
            if(OperatorList[OperatorIndex].skillMul[j][3] != 0)Atk[j][3] *= OperatorList[OperatorIndex].skillMul[j][3];
        }
        AtkSpeed = OperatorList[OperatorIndex].atkSpeed;

        while(1){
            printf("请选择藏品类型(-1结束选择):\n0 攻速\n1 局外\n2 局内\n3 全局乘算叠乘\n4 脆弱\n");
            int type;
            scanf("%d",&type);
            if(type == -1){break;}
            switch (type){
                case 0:SelectAtkSpeedRelic();break;
                case 1:SelectMulAddRelic();break;
                case 2:SelectGlobalMulAddRelic();break;
                case 3:SelectGlobalMulMulRelic();break;
                case 4:SelectGlobalFragileRelic();break;
                default: ;
            }
        }

        if(OperatorList[OperatorIndex].damageType[2]){
            //读入类型
            printf("请选择敌方类型:\n0 非领袖\n1 领袖\n");
            scanf("%d",&Boss);
        }

        if(OperatorList[OperatorIndex].damageType[0]){
            //读入防御力
            double def;
            printf("请输入敌方防御力:\n");
            scanf("%lf",&def);
            def = def - OperatorList[OperatorIndex].ignoreDef[0] > 0 ? def - OperatorList[OperatorIndex].ignoreDef[0] : 0;

            //计算总伤
            double sum[6] = {0};
            Sum = 0;
            for(int i=0;i<6;i++){
                sum[i] = OperatorList[OperatorIndex].atk;
                for(int j=0;j<3;j++){
                    sum[i] *= Atk[i][j];
                }
                sum[i] = sum[i]-def > sum[i] * 0.05 ? sum[i] - def : sum[i] * 0.05;
                //保底伤害
                for(int j=3;j<MAX;j++){
                    sum[i] *= Atk[i][j];
                }
                const double atkCount = OperatorList[OperatorIndex].skillDuration[i] == 0 ? 1 : OperatorList[OperatorIndex].skillDuration[i] / (OperatorList[OperatorIndex].atkInterval * 100.0 / AtkSpeed);
                //特判零值，按连击处理
                sum[i] *=  atkCount * OperatorList[OperatorIndex].atkCount[i];
                Sum += sum[i];
            }
        }

        double specialDamage = 0;
        if(OperatorList[OperatorIndex].damageType[1]){
            //读入法抗
            double res;
            printf("请输入敌方法术抗性:\n");
            scanf("%lf",&res);
            res = res - OperatorList[OperatorIndex].ignoreDef[1] > 0 ? res - OperatorList[OperatorIndex].ignoreDef[1] : 0;

            //计算总伤
            double sum[6] = {0};
            Sum = 0;
            if(OperatorIndex == 2){HandleSpecialCase(res);}
            else{
                for(int i=0;i<6;i++){
                    sum[i] = OperatorList[OperatorIndex].atk;
                    for(int j=0;j<MAX;j++){
                        sum[i] *= Atk[i][j];
                    }
                    sum[i] = sum[i] * (100 - res) / 100.0 > sum[i] * 0.05 ? sum[i] * (100 - res) / 100.0 : sum[i] * 0.05;
                    const double atkCount = OperatorList[OperatorIndex].skillDuration[i] == 0 ? 1 : OperatorList[OperatorIndex].skillDuration[i] / (OperatorList[OperatorIndex].atkInterval * 100.0 / AtkSpeed);
                    sum[i] *=  atkCount * OperatorList[OperatorIndex].atkCount[i];
                    Sum += sum[i];
                }
            }
            if(OperatorIndex == 4){Sum -= sum[3];specialDamage = sum[3];}
        }

        if(OperatorIndex == 2){printf("已模拟%d次\n",TRY);}
        printf("总伤:%lf\n",Sum);
        if(OperatorIndex == 4){printf("拉普兰德本体伤害:%lf\n",specialDamage);}
        system("pause");
    }
    return 0;
}

void HandleSpecialCase(const double res){
    //使用模拟取平均
    double sum[3] = {0};
    for(int i=0;i<2;i++){
        sum[i] = OperatorList[2].atk;
        for(int j=0;j<3;j++){
            sum[i] *= Atk[i][j];
        }
        sum[i] += 150;
        sum[i] = sum[i] * (100 - res) / 100.0 > sum[i] * 0.05 ? sum[i] * (100 - res) / 100.0 : sum[i] * 0.05;
        for(int j=3;j<MAX;j++){
            sum[i] *= Atk[i][j];
        }
    }
    sum[2] = OperatorList[2].atk;
    for(int j=0;j<MAX;j++){sum[2] *= Atk[2][j];}

    const int atkCount = (int)round(30 / (OperatorList[2].atkInterval * 100.0 / AtkSpeed));
    const int ElementBurstDuration = atkCount / 2;
    //15s爆发占据逻技能时间一半
    int ElementBurstTimer = 0;
    double *dph = malloc(atkCount*sizeof(double));
    //使用每次攻击伤害计算，处理爆条时机导致的伤害变化
    double ApoptosisDamage = 0;

    int try = TRY;
    double first = 0;
    srand((unsigned)time(NULL));
    while(try--){
        //循环模拟try次
        double totalDamage = 0;
        for(int i = 0;i < atkCount;i++){
            //按照每一发攻击计算总伤
            const int randomMod = rand() % 5;
            if(randomMod < 3){dph[i] = sum[0] + sum[1];}
            else{dph[i] = sum[0];}
            if(ApoptosisDamage < 1000 + Boss*1000){ApoptosisDamage += dph[i] * 0.08 * (1+ElementFragile);}
            else{
                //凋亡爆发期
                if(ElementBurstTimer == 0){Sum += 12000;}
                if(randomMod < 3){dph[i] += sum[2];}
                ElementBurstTimer++;
                if(ElementBurstTimer == ElementBurstDuration){ElementBurstTimer = 0;ApoptosisDamage = 0;}
            }
            totalDamage += dph[i];
        }
        if(try == TRY - 1){first = totalDamage;}
        else{Sum += totalDamage - first;}
        //只累计偏差值，防止爆double
    }
    free(dph);
    Sum = first + Sum / TRY;
}
