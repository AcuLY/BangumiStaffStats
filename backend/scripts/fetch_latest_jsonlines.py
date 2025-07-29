import time
import requests
import zipfile
import subprocess
import os
from datetime import datetime, time as dt_time, timedelta, timezone 

PROXY_URL = "https://ghfast.top/"
LATEST_JSON_URL = "https://raw.githubusercontent.com/bangumi/Archive/master/aux/latest.json"
TARGET_DAY = 2  # 周三
TARGET_TIME = dt_time(hour=19, minute=0)
TARGET_DIR = "../static"
MAX_RETRIES = 3
RETRY_DELAY = 10
REQUIRED_JSONLINES = [
    'subject.jsonlines', 
    'person.jsonlines', 
    'character.jsonlines', 
    'subject-characters.jsonlines', 
    'subject-persons.jsonlines', 
    'person-characters.jsonlines', 
    'subject-relations.jsonlines'
]

database_initialized = False 


def wait_until_target_time():
    if not os.path.exists(TARGET_DIR):
        print(f"[wait] 目录 {TARGET_DIR} 不存在，创建中...")
        os.makedirs(TARGET_DIR, exist_ok=True)
    
    existing_files = os.listdir(TARGET_DIR)
    if any(file not in existing_files for file in REQUIRED_JSONLINES):
        print(f"[wait] 目录 {TARGET_DIR} 缺少必要文件：{[file for file in REQUIRED_JSONLINES if file not in existing_files]}，立即获取最新的 jsonlines 文件")
        return
    else:
        print(f"[wait] 目录 {TARGET_DIR} 不为空，等待下次获取最新的 jsonlines 文件")
    
    global database_initialized
    if not database_initialized:
        print("首次启动，开始初始化数据库")
        subprocess.run(["python", "-u", "update_database.py", "--all"], check=True)
        database_initialized = True
        print("数据库初始化完成")
    
    print(f"[wait] 等待 UTC 时间每周 {TARGET_DAY} {TARGET_TIME.strftime('%H:%M')}...")
    while True:
        now = datetime.now(timezone.utc)
        today = now.date()
        start_of_week = today - timedelta(days=now.weekday())
        target_dt = datetime.combine(start_of_week + timedelta(days=TARGET_DAY), TARGET_TIME, tzinfo=timezone.utc)

        if now >= target_dt and (now - target_dt) < timedelta(hours=1):
            print(f"[wait] 当前时间 {now} 已满足条件，开始执行任务")
            return
        else:
            time.sleep(1800)


def fetch_latest_info():
    print("[fetch_latest_info] 正在获取最新的 jsonlines 信息...")
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(
                PROXY_URL + LATEST_JSON_URL,
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            print(f"[fetch_latest_info] 第 {attempt} 次尝试失败： {e}")
            if attempt < MAX_RETRIES:
                print(f"{RETRY_DELAY} 秒后重试")
                time.sleep(RETRY_DELAY)
            else:
                print("[fetch_latest_info] 放弃")
                raise


def download_and_unzip(url, filename):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            print(f"[download_and_unzip] 开始下载 {url}")
            os.makedirs(TARGET_DIR, exist_ok=True)
            zip_path = os.path.join(TARGET_DIR, filename)

            wget_cmd = [
                "wget",
                "-O", zip_path,
                "--timeout=60",
                f"--tries={MAX_RETRIES}",
                "-q",
                url
            ]

            try:
                subprocess.run(wget_cmd, check=True)
                print(f"[download_and_unzip] 下载完成：{zip_path}")
            except subprocess.CalledProcessError as e:
                print(f"[download_and_unzip] wget 下载失败：{e}")
                raise
            
            print(f"删除旧的 jsonlines 文件")
            for file in REQUIRED_JSONLINES:
                file_path = os.path.join(TARGET_DIR, file)
                if os.path.exists(file_path):
                    os.remove(file_path)
                    print(f"已删除旧文件：{file_path}")

            print(f"[download_and_unzip] 开始解压 {zip_path}")
            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                zip_ref.extractall(TARGET_DIR)

            os.remove(zip_path)
            print(f"[download_and_unzip] 删除压缩包 {zip_path}")

            return
        except Exception as e:
            print(f"[download_and_unzip] 第 {attempt} 次尝试失败： {e}")
            if attempt < MAX_RETRIES:
                print(f"Retrying in {RETRY_DELAY} seconds...")
                time.sleep(RETRY_DELAY)
            else:
                print("[download_and_unzip] 放弃")
                raise


def main():
    os.makedirs(TARGET_DIR, exist_ok=True)

    while True:
        wait_until_target_time()

        try:
            latest_info = fetch_latest_info()
            url = PROXY_URL + latest_info["browser_download_url"]
            filename = latest_info["name"]
            download_and_unzip(url, filename)

            print("下载解压成功，开始执行更新数据库脚本")
        except Exception as e:
            print(f"下载解压出错: {e}")

        try:
            subprocess.run(["python", "-u", "update_database.py", "--all"], check=True)
            print("数据库更新成功")
        except subprocess.CalledProcessError as e:
            print(f"更新数据库出错: {e}")

        # 等待 1 小时，避免重复触发
        time.sleep(3600)


if __name__ == "__main__":
    main()
