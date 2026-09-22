<script setup lang="ts">
/**
 * 协议页（服务条款 / 隐私协议）
 *
 * - 同一个组件按路由 path 切换内容：/terms → 服务条款，/privacy → 隐私协议
 * - 未登录态也必须可访问（登录/注册页底部勾选/声明文案会跳转到这里）
 * - 空白布局 + 浅色纸质卡片，风格与登录页一致
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const isPrivacy = computed(() => route.path.startsWith('/privacy'))
const title = computed(() => (isPrivacy.value ? '隐私协议' : '服务条款'))
const updatedAt = '2026 年 9 月 22 日'

const termSections = [
  {
    h: '一、协议的接受与修改',
    ps: [
      '欢迎使用「简账」（以下简称"本产品"）。您在注册账号或使用本产品时，即表示您已阅读、理解并同意接受本服务条款的全部内容。',
      '我们可能根据法律法规变化或产品升级对本条款进行修订，修订后的条款将通过本页面公告等方式发布。若您继续使用本产品，视为您接受修订后的条款。',
    ],
  },
  {
    h: '二、账号与使用规范',
    ps: [
      '您应使用真实、合法的信息注册账号，并妥善保管账号及密码。因您主动泄露密码或遭受他人攻击导致的损失，由您自行承担。',
      '您承诺不利用本产品从事任何违反法律法规或损害他人合法权益的活动，包括但不限于录入、传播违法违规内容。',
    ],
  },
  {
    h: '三、服务内容与变更',
    ps: [
      '本产品为您提供个人记账服务，包括收支记录、账户与预算管理、统计报表等功能。我们可能不断优化或调整部分功能，重要变更将提前告知。',
      '因系统维护、升级等原因导致服务临时中断，我们将尽力缩短中断时间，但不承担由此造成的间接损失。',
    ],
  },
  {
    h: '四、数据与知识产权',
    ps: [
      '您在本产品中录入的记账数据归您本人所有。您可随时在"设置"中导出自己的数据。',
      '本产品的界面设计、代码、商标等知识产权归本产品开发者所有，未经许可不得复制或用于商业用途。',
    ],
  },
  {
    h: '五、免责声明',
    ps: [
      '本产品为个人记账工具，所提供的统计与分析结果仅供参考，不构成任何投资、理财建议。',
    ],
  },
  {
    h: '六、法律适用与联系',
    ps: [
      '本条款适用中华人民共和国法律。如对本条款有任何疑问，可通过站内反馈渠道与我们联系。',
    ],
  },
]

const privacySections = [
  {
    h: '一、我们收集的信息',
    ps: [
      '为向您提供记账服务，我们收集：您注册时提供的用户名/邮箱；您使用产品时主动录入的记账数据（收支、账户、预算、备注等）；为保障账号安全而记录的基本登录信息（登录时间、设备信息摘要）。',
      '我们不收集与记账服务无关的信息，不读取您的通讯录、短信、通话记录等敏感权限。',
    ],
  },
  {
    h: '二、信息的使用',
    ps: [
      '您的信息仅用于：提供和维持记账服务、保障账号与数据安全、改进产品体验。我们不会将您的个人信息用于广告推送，也不会出售给任何第三方。',
    ],
  },
  {
    h: '三、信息的存储与保护',
    ps: [
      '您的数据存储于中华人民共和国境内的服务器，我们采用传输加密、访问控制等技术手段保护您的数据安全，并按法律法规要求确定合理的保存期限。',
      '如发生个人信息安全事件，我们将按照法律法规要求及时告知您并采取补救措施。',
    ],
  },
  {
    h: '四、信息的共享与披露',
    ps: [
      '除以下情形外，我们不会向第三方提供您的个人信息：事先获得您的明确同意；根据法律法规、司法或行政机关的强制性要求；为维护您或公众的人身财产安全所必需。',
    ],
  },
  {
    h: '五、您的权利',
    ps: [
      '您有权随时查看、更正、导出您的记账数据；您可以在"设置"中注销账号。账号注销后，我们将在合理期限内删除或匿名化处理您的个人信息，法律法规另有要求的除外。',
    ],
  },
  {
    h: '六、未成年人保护与联系',
    ps: [
      '本产品面向成年人提供服务。如您为未成年人，请在监护人指导下使用本产品。',
      '如您对本协议或个人信息保护有任何疑问、投诉或建议，可通过站内反馈渠道与我们联系，我们将在 15 个工作日内答复。',
    ],
  },
]

const sections = computed(() => (isPrivacy.value ? privacySections : termSections))
</script>

<template>
  <div class="agreement-page">
    <header class="agreement-head">
      <button class="back-btn" type="button" @click="router.back()">
        ← 返回
      </button>
      <h1 class="agreement-title">
        {{ title }}
      </h1>
      <p class="agreement-meta">
        更新日期：{{ updatedAt }}
      </p>
    </header>

    <main class="agreement-body">
      <section v-for="s in sections" :key="s.h" class="sec">
        <h2 class="sec-title">
          {{ s.h }}
        </h2>
        <p v-for="(p, i) in s.ps" :key="i" class="sec-text">
          {{ p }}
        </p>
      </section>
    </main>
  </div>
</template>

<style scoped lang="scss">
.agreement-page {
  box-sizing: border-box;
  width: 100%;
  min-height: 100vh;
  padding: 48px 16px 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--lz-bg-page, #f4f6fa);
}

.agreement-head {
  width: 100%;
  max-width: 720px;
  text-align: center;
  margin-bottom: 32px;
}

.back-btn {
  float: left;
  margin-top: 6px;
  border: none;
  background: none;
  font-size: 14px;
  color: var(--lz-text-secondary, #5a6478);
  cursor: pointer;
  padding: 4px 8px;

  &:hover {
    color: var(--lz-primary-600, #3b6fd4);
  }
}

.agreement-title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  color: var(--lz-text-primary, #1f2a3d);
}

.agreement-meta {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--lz-text-tertiary, #98a2b3);
}

.agreement-body {
  width: 100%;
  max-width: 720px;
  box-sizing: border-box;
  padding: 40px 48px;
  border-radius: 20px;
  background: var(--lz-bg-card, #fff);
  box-shadow: 0 8px 32px -12px rgb(31 42 61 / 10%);
}

.sec + .sec {
  margin-top: 28px;
}

.sec-title {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--lz-text-primary, #1f2a3d);
}

.sec-text {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.85;
  color: var(--lz-text-secondary, #4a5568);
  text-align: justify;
}

@media (max-width: 640px) {
  .agreement-body {
    padding: 24px 20px;
    border-radius: 14px;
  }

  .back-btn {
    float: none;
    display: block;
    margin: 0 auto 12px;
  }
}
</style>
