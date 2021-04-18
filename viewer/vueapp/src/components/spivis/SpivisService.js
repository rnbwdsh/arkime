import Vue from 'vue';

export default {

  /* service methods ------------------------------------------------------- */
  /**
   * Gets raw packet data from the server
   * @param {object} query        Parameters to query the server
   * @param {object} cancelToken  Token to cancel the request
   * @returns {Promise} Promise   A promise object that signals the completion
   *                              or rejection of the request.
   */
  getRaw: function (nodename, ids, cancelToken) {
    return new Promise((resolve, reject) => {
      const options = {
        url: `api/session/raw/${nodename}`,
        method: 'POST',
        data: { ids },
        cancelToken: cancelToken
      };

      Vue.axios(options)
        .then((response) => {
          if (response.data.error) { reject(response.data.error); }
          resolve(response);
        }, (error) => {
          if (!Vue.axios.isCancel(error)) {
            reject(error);
          }
        });
    });
  }
};
