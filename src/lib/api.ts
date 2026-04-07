import axios from "axios";
import Cookies from "js-cookie";

const api = axios.create({
  baseURL: "https://inkart-virid.vercel.app/api/v1",
});

api.interceptors.request.use((config) => {
  const token = Cookies.get("token") || localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      Cookies.remove("user");
      Cookies.remove("token");
      Cookies.remove("refreshToken");

      localStorage.removeItem("user");
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");

      window.location.href = "/login";
    }

    return Promise.reject(error);
  }
);

export default api;