# websocket

> [Spring WebSocket使用token认证连接](https://blog.csdn.net/lnkToKing/article/details/78341204)  
[初探和实现websocket心跳重连](https://www.cnblogs.com/1wen/p/5808276.html)  
WebSocket 是什么原理？为什么可以实现持久连接？ - Ovear的回答 - 知乎
https://www.zhihu.com/question/20215561/answer/40316953

项目的代码 react 版，可以看此[页面完整版]()

在 componentDidMount 把定时器生效  
// 定时器
this.heartCheck();  

难点在于需求是两分钟刷新一次，以及权限认证问题，服务器会在两分钟内无数据传输就会默认关闭websocket连接，故需要实现心跳机制。关于权限认证，这里实现比较简单，还是觉得不够好，可以用socket.io 组件，或者参考https://facundoolano.wordpress.com/2014/10/11/better-authentication-for-socket-io-no-query-strings/解决加密问题。

```javascript
createWebSocket = (groupId) => {
  let ws = null;
  const server = 'ws.hitsm.cloud.saas.hand-china.com';
  // const server = '10.211.103.156:8050';
  const cookies = new Cookies();
  const accessToken = cookies.get(HAP.ACCESS_TOKEN);
  const url = `ws://${server}/websocket?token=${accessToken}`;
  const { heartCheck } = this.state;
  try {
    ws = new WebSocket(url);
    ws.onclose = () => {
      this.reconnect();
    };
    ws.onerror = () => {
      // this.reconnect();
    };
    ws.onopen = () => {
      //心跳检测重置
      const {AppState} = this.props;
      const projectId = AppState.currentMenuType.id;
      heartCheck.reset();
      heartCheck.start();
      // console.log('open执行');
      let chartList = JSON.stringify({
        groupId: groupId,
        projectId: projectId
      });
      // console.log(chartList);
      ws.send(chartList);
    };
    ws.onmessage = (e) => {
      //如果获取到消息，心跳检测重置
      //拿到任何消息都说明当前连接是正常的
      // console.log(e.data);
      if (e.data !== 'H&M') {
        this.dataDistribution(e);
      }
      heartCheck.reset();
      heartCheck.start();
      // console.log('执行');
    }
  } catch (e) {
    // this.reconnect();
  }
  this.setState({ ws });
};

reconnect = () => {
  const that = this;
  const { lockReconnect } = this.state;
  if(lockReconnect) return;
  this.setState({ lockReconnect: true });
  //没连接上会一直重连，设置延迟避免请求过多
  setTimeout( () => {
    const { groupId } = this.state;
    that.createWebSocket(groupId);
    that.setState({ lockReconnect: false });
  }, 10000);
};

heartCheck = () => {
  const that = this;
  const heartCheck = {
    timeout: 30000,//30秒
    timeoutObj: null,
    serverTimeoutObj: null,
    reset: function(){
      clearTimeout(this.timeoutObj);
      clearTimeout(this.serverTimeoutObj);
      return this;
    },
    start: function(){
      const self = this;
      this.timeoutObj = setTimeout(function(){
        //这里发送一个心跳，后端收到后，返回一个心跳消息，
        //onmessage拿到返回的心跳就说明连接正常
        const { ws } = that.state;
        ws.send("H&M");
        // console.log('start执行');
        self.serverTimeoutObj = setTimeout(function(){
          //如果超过一定时间还没重置，说明后端主动断开了
          ws.close();
          that.setState({ lockReconnect: true })
          // console.log('关闭');
        }, self.timeout)
      }, this.timeout)
    }
  };
  this.setState({ heartCheck })
};
```

