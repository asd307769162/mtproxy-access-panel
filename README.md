# MTProxy Access Panel

独立的MTProxy卡密、激活和用户管理面板。独角数卡只需发放面板地址与唯一Token，不需要对接商城接口。

## 第一阶段规则

- 套餐：激活后30天、上下行合计200GB。
- X-UI服务器在管理后台动态维护，每台服务器独立保存面板连接信息、转发目标和 MTProxy Secret。
- 新 Token 激活时在所有已启用服务器之间轮询分配；新增服务器无需修改代码或重新构建镜像。
- 首次升级会把原有 `XUI_V2_*` 环境变量和公共 Secret 自动迁移为别名 `v2` 的服务器配置。
- 激活时创建全新随机 `dokodemo-door` TCP入站。
- X-UI设备限制强制设置为2，同时开启设备提醒。
- 用户可以暂停和恢复；暂停期间有效期继续计算。
- 到期或流量耗尽后自动关闭入站。
- 最近24小时IP、中文归属地和时间从X-UI控制台内部接口读取。

## 安全边界

- `.env`、SQLite数据库、真实Token、X-UI凭据和MTProxy Secret不得提交Git。
- 数据库仅在容器内部卷保存，不映射数据库端口。
- 管理员会话使用HttpOnly Cookie；正式使用前应在反向代理配置HTTPS。
- 自动创建失败时Token恢复为未使用状态，不会吞卡。

## 本地运行

复制 `.env.example` 为 `.env`，填写配置后运行：

```bash
npm ci
npm run dev
```

用户页面：`http://localhost:3000/`

管理后台：`http://localhost:3000/admin`

## 服务器部署

```bash
docker compose config
docker compose up -d --build
```

面板默认监听 `8790`。正式发货格式：

```text
http://103.118.245.108:8790{NL}Token：MTP-xxxxxxxx
```
