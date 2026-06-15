<template>
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue'
import { useCompetitionStore } from './stores/competition'

const store = useCompetitionStore()

onMounted(() => {
  console.log('🏆 跳高项目实时计分系统已启动')
})
</script>
