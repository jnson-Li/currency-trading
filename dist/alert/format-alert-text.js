import { formatSystemHealth } from '../metrics/system-health-formatter.js';
export function formatAlertText(level, env, report) {
    const prefix = level === 'warning' ? '🟡 WARNING' : level === 'danger' ? '🟠 DANGER' : '🔴 FATAL';
    return `
${prefix} | ENV: ${env}

${formatSystemHealth(report)}
`;
}
