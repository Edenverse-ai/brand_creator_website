# 视频生成接口文档

# AI 开放平台：视频生成接口文档

> **版本**: v1.1  
> **更新日期**: 2026-08-07  
> **适用范围**: 已开通 OpenAPI 的客户
>
> **v1.1 变更**：新增 `seedance2.5` 档位（分辨率 `480p`/`720p`、时长可达 30 秒、参考素材上限 30 图 / 10 视频 / 10 音频），新增「分档参数矩阵」与「Seedance 2.5 的宽高比约束」两节；`mini` 档时长纳入 `[4, 15]` 校验。

---

## 概述

视频生成 API 提供基于大模型的异步视频生成能力，支持文生视频、图生视频（首尾帧 / 参考图）、多模态参考（图片 / 视频 / 音频组合），并可选开启链式画质超分。

**核心特点：**

- 视频生成为**异步**任务：先创建任务，再轮询查询结果。
- 支持文生视频、图生视频（首尾帧 / 参考图）、多模态参考（图片 / 视频 / 音频组合）。
- 支持**链式超分**（可选）：SD2 任务成功后自动派发画质增强子任务，对外只暴露一个 `task_id`，整链失败则整任务失败且不扣费。
- 创建成功后返回 `task_id`，初始状态 `pending`；轮询查询结果。

---

## 鉴权方式

| 方式   | Header   | 格式                   | 说明                    |
| ------ | -------- | ---------------------- | ----------------------- |
| ApiKey | `ApiKey` | `ApiKey: your-api-key` | 使用平台分配的 API 密钥 |

如该 ApiKey 开启了**来源 IP 白名单**，请求来源 IP 需在白名单内，否则会被拒绝。

---

## 公共说明

- **请求方式**: 全部 `POST`
- **Content-Type**: `application/json`
- **Base URL**: 通过管理后台获取（下文以 `{BASE_URL}` 表示）

> 下文 `{BASE_URL}` 即代表上述 Base URL。

### 通用响应格式

所有接口走网关层统一包装。

**成功响应（HTTP 200）：**

```json
{
  "code": 0,
  "message": "",
  "data": {
    "task_id": "..."
  },
  "trace_id": "71f1a89b70e7d7c751c394ceae7d8d9f"
}
```

**业务错误响应（HTTP 200，业务码非 0）：**

```json
{
  "code": <非 0 业务码>,
  "message": "<错误描述>",
  "data": {},
  "trace_id": "..."
}
```

**系统错误响应（HTTP 非 200）：**

```json
{
  "code": <HTTP 状态码>,
  "reason": "",
  "message": "<错误描述>",
  "metadata": {}
}
```

> 客户端建议：先看 HTTP 状态码，再看 `code`——`HTTP 200 + code == 0` 才视为成功；其他都按错误处理，并把 `trace_id` 一起上报排障。

### 字段命名

返回的 JSON 字段名是 **snake_case**（`task_id` / `video_url` / `tos_key`）。请求 body 同样用 snake_case。

### 接口列表

| 接口            | 方法 | 路径                                            | 说明                             |
| --------------- | ---- | ----------------------------------------------- | -------------------------------- |
| CreateTask      | POST | `/ai-open-platform-api/v1/lz/video/task/create` | 创建任务，返回 `task_id`         |
| QueryTaskStatus | POST | `/ai-open-platform-api/v1/lz/video/task/status` | 查询任务状态；成功时返回视频 URL |

---

## 1. 创建视频生成任务

创建视频生成任务。模型依据传入的 `prompt` 与素材生成视频，完成后通过查询接口获取结果。

**请求路径**: `POST {BASE_URL}/ai-open-platform-api/v1/lz/video/task/create`

### 请求参数

| 字段                                                                      | 类型                  | 必填     | 默认值                                                        | 说明                                                                                                                                                                                     |
| ------------------------------------------------------------------------- | --------------------- | -------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prompt`                                                                  | string                | 条件必填 | —                                                             | 文本提示词。当 `images`、`videos` 都未传时，**必填**                                                                                                                                     |
| `mode`                                                                    | string                | 否       | `fast`                                                        | 模型档位：`fast` / `pro` / `mini` / `seedance2.5`。**各档的分辨率、时长、素材数量上限不同**，见下方「分档参数矩阵」                                                                      |
| `images`                                                                  | ImageInput 数组       | 否       | —                                                             | 输入图片，数量上限随 `mode` 而定（`seedance2.5` 最多 30 张，其余档位最多 9 张）                                                                                                          |
| `videos`                                                                  | VideoInput 数组       | 否       | —                                                             | 参考视频，数量上限随 `mode` 而定（`seedance2.5` 最多 10 个，其余档位最多 3 个）                                                                                                          |
| `audios`                                                                  | AudioInput 数组       | 否       | —                                                             | 参考音频，数量上限随 `mode` 而定（`seedance2.5` 最多 10 段，其余档位最多 3 段）                                                                                                          |
| `resolution`                                                              | string                | 否       | `720p`                                                        | 输出分辨率，取值随 `mode` 而定，见「分档参数矩阵」。`4k` 仅 `pro` 支持；`seedance2.5` 仅支持 `480p` / `720p`                                                                             |
| `ratio`                                                                   | string                | 否       | `adaptive`                                                    | 宽高比：`16:9` / `4:3` / `1:1` / `3:4` / `9:16` / `21:9` / `adaptive`。⚠ `seedance2.5` 在首帧/首尾帧、视频编辑、视频延长三类任务中**仅支持 `adaptive`**，见「Seedance 2.5 的宽高比约束」 |
| `duration`                                                                | int32                 | 否       | `5`                                                           | 视频时长（秒），取值随 `mode` 而定（`seedance2.5` 为 `[4, 30]`，其余档位为 `[4, 15]`），或 `-1` 表示由模型智能选择                                                                       |
| `generate_audio`                                                          | bool                  | 否       | `true`                                                        | 是否生成同步音频                                                                                                                                                                         |
| `watermark`                                                               | bool                  | 否       | `false`                                                       | 是否添加水印                                                                                                                                                                             |
| `seed`                                                                    | int64                 | 否       | —                                                             | 随机种子，不传由系统随机                                                                                                                                                                 |
| `return_last_frame`                                                       | bool                  | 否       | `false`                                                       | 为 `true` 时生成尾帧；查询接口在 `status=succeeded` 时返回 `last_frame_url`                                                                                                              |
| `tools`                                                                   | Tool 数组             | 否       | —                                                             | 工具列表，如 `[{"type":"web_search"}]`，开启联网搜索增强时效性（仅 SD2.0 系列）                                                                                                          |
| `execution_expires_after`                                                 | int64                 | 否       | `172800`                                                      | 任务超时阈值（秒），范围 `[3600, 259200]`；从受理起算，超时后任务终止并标记 `failed`（原因为超时）。不传用默认值                                                                         |
| `super_resolution_config`                                                 | SuperResolutionConfig | 否       | —                                                             | 链式超分配置，非空即启用                                                                                                                                                                 |
| `ips`                                                                     | string 数组           | 否       | —                                                             | 版权放行：已备案版权 IP 的 `kz_ip_id`，最多 5 个。见下文「版权放行」                                                                                                                     |
| <font style="color:#000000;background-color:#FFFFFF;">bitrate_mode</font> | string                | 否       | <font style="color:#000000;background-color:#FFFFFF;"></font> | <font style="color:#000000;background-color:#FFFFFF;">视频画质档位：standard（默认，比特率适中，平衡画质与体积）                                                                         | high（更高比特率，保留更多细节、减少色带与块效应，输出体积约为 standard 的 3-5 倍）；控制同分辨率下输出比特率</font>                                                                 |
| `output_format`                                                           | string                | 否       | `mp4`                                                         | 输出视频格式：`mp4`（默认，通用格式，兼容性最好，采用标准色彩精度，可在网页、移动端、各类播放器及分发平台直接播放）                                                                      | `mov`（面向专业场景的高色彩精度格式，更好地保持画面色彩与亮度一致性，适用于调色、抠像、合成等对色彩还原要求高的专业后期加工；推荐在视频编辑、视频延长场景使用 `mov` 作为输入和输出） |
|                                                                           |                       |          |                                                               |                                                                                                                                                                                          |

### 分档参数矩阵

不同 `mode` 的参数上限不同，请按下表取值：

| mode          | resolution                       | duration           | 参考图   | 参考视频 | 参考音频 |
| ------------- | -------------------------------- | ------------------ | -------- | -------- | -------- |
| `pro`         | `480p` / `720p` / `1080p` / `4k` | `4~15` 或 `-1`     | ≤ 9      | ≤ 3      | ≤ 3      |
| `fast`        | `480p` / `720p` / `1080p`        | `4~15` 或 `-1`     | ≤ 9      | ≤ 3      | ≤ 3      |
| `mini`        | `480p` / `720p` / `1080p`        | `4~15` 或 `-1`     | ≤ 9      | ≤ 3      | ≤ 3      |
| `seedance2.5` | **`480p` / `720p`**              | **`4~30` 或 `-1`** | **≤ 30** | **≤ 10** | **≤ 10** |

> - `4k` 仅 `pro` 支持；`seedance2.5` 不支持 `1080p` 与 `4k`。
> - `seedance2.5` 支持**纯音频参考**（只给 `audios` + `prompt`，无需搭配 `images` / `videos`）；其余档位的参考音频需配合图片或视频使用。
> - ⚠ 即便走纯音频参考，**仍须满足「`images`、`videos` 都未传时 `prompt` 必填」**——只传 `audios` 而不传 `prompt` 会被拒绝。

**两条需要注意的行为（升级前请先读）：**

1. **`mini` 档的 `duration` 现在会被校验。** 此前本接口只校验 `fast` / `pro` 的时长，`mini` 不做校验；现已纳入 `[4, 15]`，与兼容接口保持一致。这不会损失任何能力（模型侧本就拒绝 `mini` 超过 15 秒），只是把拒绝点提前到了网关、错误提示更明确。
2. **只传 `kzep` 而不传 `mode` 时，按 `fast` 的上限校验。** `mode` 留空会被填为默认值 `fast`，因此即使该 `kzep` 对应的是 `seedance2.5` 档位，网关仍会用 `fast` 的 9/3/3 与 `[4, 15]` 去校验请求。**要用满 `seedance2.5` 的 30/10/10 与 30 秒时长，必须显式传 `mode=seedance2.5`。**

### Seedance 2.5 的宽高比约束

`seedance2.5` 在以下三类任务中**仅支持 `ratio=adaptive`**（输出宽高比自动跟随输入素材）。这三类任务的拒绝时机不同：

| 任务类型            | 触发条件                                                                      | 平台行为                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 首帧 / 首尾帧生视频 | `images[].role` 为 `first_frame` / `last_frame`                               | **创建时同步拒绝**，直接返回参数错误（**同样要求显式传 `mode=seedance2.5`**；只传 `kzep` 时该预检不触发，退化为下面的异步失败路径） |
| 视频编辑            | `role` 为 `reference_*`，且提示词含「编辑 / 增加 / 删除 / 修改 / 替换」等意图 | 放行提交，由模型判定后**异步失败**，错误码 `InvalidParameter.TaskTypeConstraint`                                                    |
| 视频延长            | `role` 为 `reference_*`，且提示词含「延长 / 延续 / 续写」等意图               | 同上                                                                                                                                |

**为什么处理方式不同**：首帧 / 首尾帧可由 `role` 确定性判定，平台在创建时即可前置拦截；而视频编辑与视频延长是由模型结合**提示词意图**判定任务类型的，平台无法在创建时判断，只能放行提交、由模型裁决后异步返回错误。

因此提交这两类任务时，请在创建请求中就把 `ratio` 设为 `adaptive`，避免任务跑到一半才失败。

> 另：**视频编辑任务的 `duration` 仅支持 `-1`**，输出时长自动与输入视频保持一致（误差不超过 0.4 秒）。

#### Tool

| 字段   | 类型   | 必填 | 说明                                        |
| ------ | ------ | ---- | ------------------------------------------- |
| `type` | string | 是   | 工具类型，当前支持 `web_search`（联网搜索） |

#### ImageInput

| 字段   | 类型   | 必填 | 说明                                |
| ------ | ------ | ---- | ----------------------------------- |
| `url`  | string | 是   | 图片 HttpURL / `asset://<ASSET_ID>` |
| `role` | string | 否   | 素材角色，见下                      |

可选 `role` 值：

| role              | 适用场景   | 说明           |
| ----------------- | ---------- | -------------- |
| `reference_image` | 参考图模式 | 参考图（默认） |
| `first_frame`     | 首尾帧模式 | 首帧           |
| `last_frame`      | 首尾帧模式 | 尾帧           |

#### VideoInput

| 字段   | 类型   | 必填 | 说明                                |
| ------ | ------ | ---- | ----------------------------------- |
| `url`  | string | 是   | 视频 HttpURL / `asset://<ASSET_ID>` |
| `role` | string | 否   | 一般为 `reference_video`（默认）    |

#### AudioInput

| 字段   | 类型   | 必填 | 说明                             |
| ------ | ------ | ---- | -------------------------------- |
| `url`  | string | 是   | 音频 URL / `asset://<ASSET_ID>`  |
| `role` | string | 否   | 一般为 `reference_audio`（默认） |

#### SuperResolutionConfig

链式超分参数：**SD2 任务成功后自动派发画质增强子任务**；整链任一步失败标记整任务失败且不扣费。

字段非空对象即视为启用超分。

| 字段               | 类型   | 必填   | 说明                                                                                                           |
| ------------------ | ------ | ------ | -------------------------------------------------------------------------------------------------------------- |
| `resolution`       | string | 二选一 | 目标分辨率预设：`720p` / `1080p` / `2k` / `4k` / `8k`。必须**严格高于** SD2 自身 `resolution`（不允许同/向下） |
| `resolution_limit` | int32  | 二选一 | 自定义短边像素 `[128, 4320]`。必须**严格大于** SD2 自身 `resolution` 的短边（480 / 720 / 1080）                |
| `scene`            | string | 否     | 场景：`common` / `aigc` / `short_series` / `ugc` / `old_film`（仅 standard 生效）                              |
| `tool_version`     | string | 否     | 版本：`standard`（默认）/ `professional`。专业版约为标准版价格的 10 倍                                         |
| `fps`              | int32  | 否     | 输出帧率 `[15, 120]`。设定值高于源视频帧率时触发智能插帧                                                       |
| `bitrate_level`    | string | 否     | 码率档位：`low` / `medium`（默认）/ `high`                                                                     |
| `bit_depth`        | int32  | 否     | 色深：`8` / `10` / `12`，仅 `tool_version=professional`                                                        |

`resolution` 与 `resolution_limit` **互斥且二选一必填**。

合法的超分分辨率映射：

| SD2 `resolution` | 允许的超分目标                        |
| ---------------- | ------------------------------------- |
| `480p`           | `720p` / `1080p` / `2k` / `4k` / `8k` |
| `720p`           | `1080p` / `2k` / `4k` / `8k`          |
| `1080p`          | `2k` / `4k` / `8k`                    |

> ⚠️ 超分作为 SD2 任务的**内部实现细节**，对外只暴露一个 `task_id`，调用方只看 `status` / `video_url` 即可——开启超分时 `status=running` 会持续到超分完成；成功后 `video_url` 直接是**超分后的最终视频**。

### 请求示例

**文生视频（最简单）：**

```bash
curl -X POST {BASE_URL}/ai-open-platform-api/v1/lz/video/task/create \
  -H "Content-Type: application/json" \
  -H "ApiKey: your-api-key" \
  -d '{
    "prompt": "一只猫在草地上奔跑，电影感镜头，阳光透过树叶",
    "mode": "fast",
    "resolution": "720p",
    "ratio": "16:9",
    "duration": 5
  }'
```

**首尾帧图生视频：**

```bash
curl -X POST {BASE_URL}/ai-open-platform-api/v1/lz/video/task/create \
  -H "Content-Type: application/json" \
  -H "ApiKey: your-api-key" \
  -d '{
    "prompt": "镜头缓缓推进",
    "mode": "fast",
    "images": [
      { "url": "https://example.com/first.jpg", "role": "first_frame" },
      { "url": "https://example.com/last.jpg",  "role": "last_frame" }
    ],
    "resolution": "720p",
    "ratio": "16:9",
    "duration": 5
  }'
```

**多模态参考：**

```bash
curl -X POST {BASE_URL}/ai-open-platform-api/v1/lz/video/task/create \
  -H "Content-Type: application/json" \
  -H "ApiKey: your-api-key" \
  -d '{
    "prompt": "女孩对着镜头微笑，背景是海边日落",
    "mode": "pro",
    "images": [
      { "url": "https://example.com/ref.jpg", "role": "reference_image" }
    ],
    "videos": [
      { "url": "https://example.com/ref.mp4", "role": "reference_video" }
    ],
    "resolution": "1080p",
    "ratio": "adaptive",
    "duration": 5
  }'
```

**开启联网搜索 + 自定义超时：**

```bash
curl -X POST {BASE_URL}/ai-open-platform-api/v1/lz/video/task/create \
  -H "Content-Type: application/json" \
  -H "ApiKey: your-api-key" \
  -d '{
    "prompt": "今天的天气适合什么穿搭，生成一段展示视频",
    "mode": "pro",
    "resolution": "720p",
    "ratio": "16:9",
    "duration": 5,
    "tools": [{ "type": "web_search" }],
    "execution_expires_after": 7200
  }'
```

**开启链式超分（1080p → 4k）：**

```bash
curl -X POST {BASE_URL}/ai-open-platform-api/v1/lz/video/task/create \
  -H "Content-Type: application/json" \
  -H "ApiKey: your-api-key" \
  -d '{
    "prompt": "城市夜景延时摄影",
    "mode": "pro",
    "resolution": "1080p",
    "ratio": "16:9",
    "duration": 5,
    "super_resolution_config": {
      "resolution": "4k",
      "scene": "aigc",
      "tool_version": "professional",
      "fps": 60
    }
  }'
```

**放行自有版权 / 肖像（传入 ips）：**

```bash
curl -X POST {BASE_URL}/ai-open-platform-api/v1/lz/video/task/create \
  -H "Content-Type: application/json" \
  -H "ApiKey: your-api-key" \
  -d '{
    "prompt": "<提示词>",
    "mode": "pro",
    "resolution": "720p",
    "ratio": "16:9",
    "duration": 5,
    "ips": ["<your_kz_ip_id_1>", "<your_kz_ip_id_2>"]
  }'
```

### 响应参数（`data`）

| 字段      | 类型   | 说明                          |
| --------- | ------ | ----------------------------- |
| `task_id` | string | 视频生成任务 ID，用于后续查询 |

### 响应示例

```json
{
  "code": 0,
  "message": "",
  "data": {
    "task_id": "kz-cgt-1tsk1800657071180349525e4b1f36797a4f"
  },
  "trace_id": "7f9a72b7476bc7838a470c3df57258da"
}
```

---

## 2. 查询任务状态

查询视频生成任务的状态；任务成功时返回视频 URL。

**请求路径**: `POST {BASE_URL}/ai-open-platform-api/v1/lz/video/task/status`

### 请求参数

| 字段      | 类型   | 必填 | 说明                  |
| --------- | ------ | ---- | --------------------- |
| `task_id` | string | 是   | 创建接口返回的任务 ID |

### 请求示例

```bash
curl -X POST {BASE_URL}/ai-open-platform-api/v1/lz/video/task/status \
  -H "Content-Type: application/json" \
  -H "ApiKey: your-api-key" \
  -d '{
    "task_id": "tsk_1800657071180349525e4b1f36797a4f"
  }'
```

### 响应参数（`data`）

| 字段                      | 类型   | 说明                                                                                           |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `task_id`                 | string | 任务 ID                                                                                        |
| `status`                  | string | 任务状态，见下表                                                                               |
| `video_url`               | string | 成片可下载 / 播放 URL，仅 `status=succeeded` 时返回                                            |
| `tos_key`                 | string | 平台 TOS 对象 key（可用于内部直读），仅 `status=succeeded` 时返回                              |
| `last_frame_url`          | string | 尾帧 PNG URL（方舟原始地址）；仅创建时传 `return_last_frame=true` 且 `status=succeeded` 时返回 |
| `seed`                    | int64  | 实际使用的随机种子（字节回显），`status=succeeded` 时返回；未知 / 随机时为 `0`                 |
| `framespersecond`         | int64  | 输出帧率 FPS（字节回显），成功时返回                                                           |
| `generate_audio`          | bool   | 是否含同步音频（字节回显）                                                                     |
| `execution_expires_after` | int64  | 任务超时阈值（秒，字节回显）                                                                   |
| `duration`                | int32  | 实际输出时长（秒）                                                                             |
| `error`                   | string | 失败原因，成功时为空                                                                           |
| `usage`                   | object | Token 用量                                                                                     |
| `usage.completion_tokens` | uint32 | 生成消耗的 token                                                                               |
| `usage.total_tokens`      | uint32 | 总 token（通常等于 `completion_tokens`）                                                       |

#### status 取值

| 取值        | 含义                                             |
| ----------- | ------------------------------------------------ |
| `pending`   | 已受理，等待内部处理                             |
| `submitted` | 已提交给底层引擎                                 |
| `running`   | 任务运行中（开启超分时，超分完成前都处于该状态） |
| `succeeded` | 任务成功，可获取 `video_url`                     |
| `failed`    | 任务失败，见 `error`                             |

> 终态（`succeeded` / `failed`）一旦进入不再变化；本接口不支持取消任务。

### 响应示例

任务运行中：

```json
{
  "code": 0,
  "message": "",
  "data": {
    "task_id": "kz-cgt-sk800657071180349525e4b1f36797a4f",
    "status": "running"
  },
  "trace_id": "..."
}
```

任务成功：

```json
{
  "code": 0,
  "message": "",
  "data": {
    "task_id": "tsk_1800657071180349525e4b1f36797a4f",
    "status": "succeeded",
    "video_url": "https://example.tos-cn-beijing.volces.com/common-queue/ai_openapi/video_tsk_xxx.mp4",
    "tos_key": "common-queue/ai_openapi/video_tsk_xxx.mp4",
    "duration": 5,
    "usage": {
      "completion_tokens": 108900,
      "total_tokens": 108900
    }
  },
  "trace_id": "..."
}
```

任务失败：

```json
{
  "code": 0,
  "message": "",
  "data": {
    "task_id": "kz-cgt-1tsk_1800657071180349525e4b1f36797a4f",
    "status": "failed",
    "error": "生成失败：输入内容未通过审核"
  },
  "trace_id": "..."
}
```

---

## 资源加白

<font style="color:#df2a3f;">默认情况下，直传图片、视频url，我们内部会处理真人自动加白，本质是帮助用户做了以下逻辑，所以没有特定需求，可以直传素材url给我们即可。</font>

<font style="color:#333333;">详情参见 </font>《素材资产管理接口》文档

<font style="color:#333333;">获得加白后的资源id，创建任务时传入即可资源url传 "asset://id" 即可</font>

## 版权放行（自有版权 / 肖像）

当您拥有相关版权 / 肖像授权并已在平台**备案**后，可在单次请求中通过 `ips` 参数，细粒度声明本次生成允许放行的版权范围。

### 参数说明

| 字段  | 类型        | 必填 | 说明                                            |
| ----- | ----------- | ---- | ----------------------------------------------- |
| `ips` | string 数组 | 否   | 已备案版权 IP 的 `kz_ip_id` 列表，最多 **5** 个 |

- `kz_ip_id`** 获取**：由平台 / 运营人员分配，请按发放的字符串**原样传入**，无需关心其内部构成，并妥善保管。
- **取值规则**：
  - 不传 或 传空数组 `[]`：本次请求**不放行任何**已备案版权（按内容安全默认策略处理）。
  - 传 1~5 个：本次请求**仅放行列表中显式声明**的版权，其余一律拦截。
- **校验要求**：列表中的每个 `kz_ip_id` 必须**属于您的账号**且处于**可用**状态；否则该次创建请求会直接报错（见错误说明）。
- 该参数与素材类型无关，文生 / 图生 / 多模态均可使用。

> 说明：版权放行为**逐次请求**控制，请在每次需要放行版权的请求中显式传入 `ips`。

## 使用限制

| 限制项                      | 说明                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **mode**                    | `fast` / `pro` / `mini` / `seedance2.5`；未传默认 `fast`                                                                            |
| **duration**                | `seedance2.5` 为 `[4, 30]` 秒，其余档位 `[4, 15]` 秒；或 `-1`（智能时长）。视频编辑任务仅支持 `-1`                                  |
| **resolution**              | `pro`：`480p` / `720p` / `1080p` / `4k`；`fast` / `mini`：`480p` / `720p` / `1080p`；`seedance2.5`：`480p` / `720p`                 |
| **ratio**                   | `16:9` / `4:3` / `1:1` / `3:4` / `9:16` / `21:9` / `adaptive`；`seedance2.5` 的首帧/首尾帧、视频编辑、视频延长任务仅支持 `adaptive` |
| **execution_expires_after** | `[3600, 259200]` 秒；不传用默认 172800                                                                                              |
| **图片数量**                | `seedance2.5` 最多 30 张，其余档位最多 9 张                                                                                         |
| **视频数量**                | `seedance2.5` 最多 10 个，其余档位最多 3 个                                                                                         |
| **音频数量**                | `seedance2.5` 最多 10 段，其余档位最多 3 段                                                                                         |
| **文生视频前置条件**        | 当 `images`、`videos` 都未传时，`prompt` 必填                                                                                       |
| **超分目标**                | 仅允许向上（严格高于 SD2 自身 `resolution` / 短边）                                                                                 |
| **超分场景**                | `aigc` / `short_series` / `ugc` / `old_film`                                                                                        |
| **超分版本**                | `standard` / `professional`（专业版约 10× 价格）                                                                                    |
| **超分 fps**                | `[15, 120]`，高于源视频帧率时触发智能插帧                                                                                           |
| **版权放行 ips**            | 最多 5 个；每个 `kz_ip_id` 须属于本账号且可用                                                                                       |

---

## 错误说明

错误统一走通用响应格式。常见参数校验错误（HTTP 200，`code` 非 0，`message` 示意如下）：

| 触发条件                                     | message 样例                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `mode` 取值非法                              | `invalid mode "xxx", must be one of: fast, mini, pro, seedance2.5`                                          |
| `resolution` 取值不被该档位支持              | `invalid resolution "1080p" for mode seedance2.5, allowed: 480p, 720p`                                      |
| `4k` 用于非 pro 型号                         | `resolution 4k is only supported in pro mode`                                                               |
| `ratio` 取值非法                             | `invalid ratio "xxx", must be one of: 16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive`                            |
| `seedance2.5` 首帧/首尾帧任务未用 `adaptive` | `seedance2.5 首帧/首尾帧任务仅支持 ratio=adaptive，当前 "16:9"`                                             |
| `execution_expires_after` 超出范围           | `invalid execution_expires_after 100, must be in [3600, 259200]`                                            |
| `duration` 超出该档位范围                    | `duration must be 4-15 for fast mode, got 20`；`duration must be 4-30 for seedance2.5 mode, got 35`         |
| 图片数量超该档位上限                         | `images count 10 exceeds maximum 9 for fast mode`                                                           |
| 视频数量超该档位上限                         | `videos count 12 exceeds maximum 10 for seedance2.5 mode`                                                   |
| 音频数量超该档位上限                         | `audios count 12 exceeds maximum 10 for seedance2.5 mode`                                                   |
| 文生视频缺少 prompt                          | `prompt is required when no images or videos are provided`                                                  |
| 超分缺少 resolution / resolution_limit       | `super_resolution_config: resolution 与 resolution_limit 二选一必填`                                        |
| 超分 resolution / resolution_limit 同时传    | `super_resolution_config: resolution 与 resolution_limit 互斥，只能传一个`                                  |
| 超分目标不合法                               | `invalid super_resolution "xxx" for resolution "720p", allowed: [...]`                                      |
| 超分 resolution_limit 超出范围               | `super_resolution_config.resolution_limit 取值范围 [128, 4320]，当前 xxx`                                   |
| 超分 resolution_limit 未严格大于源短边       | `super_resolution_config.resolution_limit=720 必须严格大于当前 resolution=720p 的短边(720)，仅支持向上超分` |
| 超分 fps 超出范围                            | `super_resolution_config.fps 取值范围 [15, 120]，当前 xxx`                                                  |
| 超分场景非法                                 | `super_resolution_config.scene 必须为 common/aigc/short_series/ugc/old_film，当前 "xxx"`                    |
| 超分版本非法                                 | `super_resolution_config.tool_version 必须为 standard 或 professional，当前 "xxx"`                          |
| 超分码率档非法                               | `super_resolution_config.bitrate_level 必须为 low/medium/high，当前 "xxx"`                                  |
| 超分色深非法 / 非专业版                      | `super_resolution_config.bit_depth 必须为 8/10/12` 或 `仅 professional 版本支持`                            |
| 版权 ips 数量超限                            | `ips 数量超出限制，最多 5 个，当前 6 个`                                                                    |
| 版权 IP 无效 / 不存在 / 不属于本账号         | `版权 IP 不存在或未授权: <kz_ip_id>`                                                                        |
| 版权 IP 当前不可用（已禁用）                 | `版权 IP 当前不可用: <kz_ip_id>`                                                                            |
| 字节 EP 无效 / 不存在 / 不属于本账号         | `字节 EP 不存在或未授权: <kz_ep>`                                                                           |
| 字节 EP 当前不可用（已禁用）                 | `字节 EP 当前不可用: <kz_ep>`                                                                               |
| 查询时 task_id 缺失                          | `task_id is required`                                                                                       |

### 任务异步失败的错误码

部分约束无法在创建时判定，任务会先受理成功，随后在查询接口以 `status=failed` + `error` 返回：

| error 中的错误码                      | 触发场景                                                                                                                            | 处理建议                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `InvalidParameter.TaskTypeConstraint` | `seedance2.5` 的**视频编辑**或**视频延长**任务未使用 `ratio=adaptive`。这两类任务由模型结合提示词意图判定，平台无法在创建时前置拦截 | 将 `ratio` 改为 `adaptive` 后重新提交；视频编辑任务同时把 `duration` 设为 `-1` |

> 该错误在任务受理之后才产生，**不消耗计费**（任务失败不扣费），但会占用一次提交与排队时间，建议在客户端提交前就按上文「Seedance 2.5 的宽高比约束」自查。

### 余额不足

创建任务前会做钱包余额前置校验。余额不足时返回 **HTTP 429**（非 200），`message` 含错误码 `40001`（`OPEN_API_ERROR_CODE_INSUFFICIENT_BALANCE`），客户端可据 HTTP 429 或该数值码区分「余额不足」与系统错误，充值后重试。

---

## 注意事项

1. **异步轮询**：建议轮询间隔 **≥ 5 秒**；视频生成通常需数分钟，开启超分时整体耗时更长。
2. **任务 ID**：请保存创建接口返回的 `task_id`，查询时作为参数传入。
3. **video_url 持久性**：成片由平台托管，但**不承诺无限期保留**——请在 `status=succeeded` 后及时下载或转存。
4. **超分语义**：开启 `super_resolution_config` 后，调用方只看 `task_id` / `status` / `video_url` 即可——超分作为 SD2 任务内部实现细节，对外**不暴露子任务状态**；整链任一步失败都标记 SD2 失败且不扣费。
5. **建议大整数走字符串**：与平台其他 OpenAPI 一致，所有 uint64 字段建议以字符串形式传输（避免 JS 精度丢失）。

---
