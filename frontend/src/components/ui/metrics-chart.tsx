import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface MetricsChartProps {
  title: string;
  xAxisData: string[];
  seriesData: number[];
  height?: number;
}

export function MetricsChart({
  title,
  xAxisData,
  seriesData,
  height = 300,
}: MetricsChartProps) {
  const options: EChartsOption = {
    backgroundColor: '#060911',
    title: {
      text: title,
      textStyle: {
        color: '#e2e8f0',
        fontSize: 16,
        fontWeight: 'normal',
      },
      left: 'left',
      padding: [0, 0, 20, 0],
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(6, 9, 17, 0.8)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      textStyle: {
        color: '#fff',
      },
      axisPointer: {
        type: 'cross',
        label: {
          backgroundColor: '#6a7985',
        },
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: [
      {
        type: 'category',
        boundaryGap: false,
        data: xAxisData,
        axisLine: {
          lineStyle: {
            color: 'rgba(255, 255, 255, 0.1)',
          },
        },
        axisLabel: {
          color: '#94a3b8',
        },
      },
    ],
    yAxis: [
      {
        type: 'value',
        splitLine: {
          lineStyle: {
            color: 'rgba(255, 255, 255, 0.05)',
          },
        },
        axisLabel: {
          color: '#94a3b8',
        },
      },
    ],
    series: [
      {
        name: title,
        type: 'line',
        smooth: true,
        lineStyle: {
          width: 3,
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: '#0ea5e9' }, // sky-500
              { offset: 1, color: '#6366f1' }, // indigo-500
            ],
          },
        },
        showSymbol: false,
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(14, 165, 233, 0.3)' },
              { offset: 1, color: 'rgba(99, 102, 241, 0.01)' },
            ],
          },
        },
        data: seriesData,
      },
    ],
  };

  return (
    <div className="w-full rounded-xl overflow-hidden border border-white/5 shadow-lg">
      <ReactECharts
        option={options}
        style={{ height: height, width: '100%' }}
        theme="dark"
      />
    </div>
  );
}
