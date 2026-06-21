# 社区共享工具借还管理系统

一个轻量级的社区工具共享平台，支持工具登记、借用申请、审核归还、逾期管理等全流程功能。

## 技术栈

- **后端**: Python 3.8+ / Flask 3.x / Flask-Cors
- **数据库**: SQLite（单文件，无需额外安装）
- **前端**: 原生 HTML / CSS / JavaScript（无需构建工具）
- **特色**: 零配置、开箱即用、数据持久化

## 目录结构

```
yq-00001/
├── app.py                 # Flask后端主程序（含API接口+DB初始化）
├── requirements.txt       # Python依赖
├── tool_share.db          # SQLite数据库文件（首次运行自动生成）
├── README.md              # 本文档
└── static/
    ├── index.html         # 主页面
    ├── css/style.css      # 样式表
    └── js/app.js          # 前端交互逻辑
```

## 启动方式

### 方式一：快速启动（推荐）

```powershell
# 1. 进入项目目录
cd d:\AAAza\AAAshuju_za\Kaifa\my_workspace\space_bz\solo_coder_now\yq-00001

# 2. 安装依赖（首次运行）
pip install -r requirements.txt

# 3. 启动服务
python app.py
```

### 方式二：虚拟环境启动（更干净）

```powershell
# 1. 创建虚拟环境
python -m venv venv

# 2. 激活虚拟环境 (Windows)
.\venv\Scripts\Activate.ps1

# 3. 安装依赖
pip install -r requirements.txt

# 4. 启动
python app.py
```

启动成功后，浏览器访问：**http://127.0.0.1:5000/**

## 主要数据表设计

### 1. `users` 用户表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 用户ID |
| username | TEXT UNIQUE | 用户名（登录用，唯一） |
| role | TEXT | 角色：`admin`（管理员）/ `resident`（居民） |
| phone | TEXT | 联系电话 |
| created_at | TEXT | 创建时间 |

**内置账号**（首次启动自动创建）：
- 管理员：用户名 `管理员`
- 居民测试账号：`张三`、`李四`

### 2. `tools` 工具表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 工具ID |
| name | TEXT | 工具名称 |
| category | TEXT | 分类（电动工具/户外露营等7类） |
| max_days | INTEGER | 最多可借天数 |
| deposit | REAL | 押金（元） |
| location | TEXT | 存放位置 |
| owner_id | INTEGER FK | 登记人用户ID |
| owner_name | TEXT | 登记人姓名（冗余，便于展示） |
| status | TEXT | 状态：`available`可用 / `repairing`维修中 / `offline`已下架 |
| description | TEXT | 工具描述 |
| created_at | TEXT | 登记时间 |

### 3. `borrow_records` 借还记录表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 记录ID |
| tool_id | INTEGER FK | 工具ID |
| borrower_id | INTEGER FK | 借用人ID |
| borrower_name | TEXT | 借用人姓名 |
| borrower_phone | TEXT | 借用人电话 |
| borrow_time | TEXT | 实际借出时间（审核通过时写入） |
| expected_return_time | TEXT | 预计归还时间 |
| actual_return_time | TEXT | 实际归还时间 |
| status | TEXT | 状态：`pending`待审核 / `approved`已借出 / `rejected`已拒绝 / `returned`已归还 / `overdue`已逾期 |
| apply_reason | TEXT | 借用申请说明 |
| reject_reason | TEXT | 审核拒绝原因 |
| created_at | TEXT | 申请提交时间 |

**状态流转**：
```
pending ──(审核通过)──> approved ──(到期未还自动)──> overdue
   │                                               │
   └──(审核拒绝)──> rejected                       └──(确认归还)──> returned
```

## 主要API接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/users/login | 登录/自动注册 |
| GET  | /api/tools | 工具列表（支持 keyword/category/status 筛选） |
| GET  | /api/tools/:id | 获取单个工具 |
| POST | /api/tools | 登记新工具 |
| PUT  | /api/tools/:id/status | 修改工具状态（管理员/登记人） |
| GET  | /api/borrows | 借还记录列表（支持状态、用户、逾期筛选） |
| POST | /api/borrows | 发起借用申请 |
| POST | /api/borrows/:id/approve | 审核通过（管理员） |
| POST | /api/borrows/:id/reject | 审核拒绝（管理员） |
| POST | /api/borrows/:id/return | 确认归还 |
| GET  | /api/dashboard | 数据概览统计 |
| GET  | /api/categories | 分类枚举 |
| GET  | /api/status-map | 状态枚举映射 |

## 验证步骤

### ✅ 基础验证（建议顺序执行）

#### 1. 居民登记工具
1. 访问 http://127.0.0.1:5000/
2. 首次弹出登录框，输入用户名 `张三` 登录（或任意新用户名自动注册）
3. 切换到「📝 登记工具」标签
4. 填写以下信息并提交：
   - 工具名称：博世家用电钻
   - 分类：电动工具
   - 最多可借天数：7
   - 押金：50
   - 存放位置：3号楼物业室
   - 描述：含全套钻头，使用时请注意安全
5. 提交后自动跳转到工具大厅，看到新登记的工具卡片

#### 2. 其他用户搜索并申请借用
1. 点击右上角「切换用户」，用 `李四` 登录
2. 在工具大厅搜索框输入「电钻」，验证搜索功能
3. 点击分类下拉框验证筛选功能
4. 找到电钻卡片，点击「申请借用」
5. 填写借用说明「家里装修打孔用」并提交申请
6. 申请成功后，当前工具卡片无法重复申请（按钮消失）

#### 3. 管理员审核申请
1. 切换用户，用 `管理员` 登录
2. 进入「📋 借还管理」标签
3. 状态筛选框选择「⏳ 待审核」，看到刚才的申请
4. 点击「审核」按钮，弹出审核窗口：
   - 可修改出借天数（默认7天）
   - 点击「同意出借」
5. 记录状态变为「已借出」，借出时间和预计归还时间自动写入

#### 4. 确认归还
1. 管理员继续在借还管理页，找到该记录
2. 点击「确认归还」，二次确认后完成归还
3. 记录状态变为「已归还」，写入实际归还时间
4. 回到工具大厅，工具状态恢复可用，可被再次申请

#### 5. 逾期管理（可选，手动验证）
1. 重新发起一次借用申请并审核通过
2. 用 SQLite 工具（如 `sqlite3` 命令或 DB Browser）打开 `tool_share.db`
3. 执行SQL手动将预期归还时间改到过去：
   ```sql
   UPDATE borrow_records SET expected_return_time = '2024-01-01 12:00:00' WHERE id = N;
   ```
4. 刷新页面，记录自动变为「已逾期」并显示逾期天数
5. 点击借还管理页的「查看逾期清单」按钮验证逾期列表

#### 6. 工具状态管理
1. 用登记人（如 `张三`）或管理员登录
2. 在工具卡片上点击「管理状态」
3. 将工具改为「维修中」或「已下架」
4. 状态改变后工具无法被申请借用
5. 改回「可用」后恢复借用

#### 7. 数据概览验证
1. 切换到「📊 数据概览」标签
2. 查看9个统计卡片：工具总数、可用、维修中、下架、待审核、借出中、逾期、已归还、用户数
3. 前面步骤操作后数据应正确统计

## 常见问题

**Q: 启动提示 ModuleNotFoundError？**
A: 运行 `pip install -r requirements.txt` 安装依赖。

**Q: 数据库想重置？**
A: 删除项目目录下的 `tool_share.db` 文件，重启服务会自动重建（含内置用户）。

**Q: 如何添加更多管理员？**
A: 修改数据库 `users` 表中对应用户的 `role` 字段为 `admin`：
```sql
UPDATE users SET role = 'admin' WHERE username = '用户名';
```

**Q: 端口被占用？**
A: 编辑 `app.py` 最后一行，将 `port=5000` 改成其他可用端口。
