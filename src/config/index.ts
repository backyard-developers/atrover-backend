export const config = {
  commandPort: parseInt(process.env.COMMAND_PORT || '8080', 10),
  mediaPort: parseInt(process.env.MEDIA_PORT || '8081', 10),

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  instanceId: process.env.INSTANCE_ID || `instance-${process.pid}`,
};
